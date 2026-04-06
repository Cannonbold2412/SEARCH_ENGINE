"""
Builder router — experience card pipeline endpoints.

Thin HTTP layer: validates input, delegates to services, returns responses.
All business logic (form merging, patch building) lives in the service layer.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.models import ExperienceCard, ExperienceCardChild, Person
from src.dependencies import (
    get_current_user,
    get_db,
    get_experience_card_child_or_404,
    get_experience_card_or_404,
)
from src.providers import (
    ChatServiceError,
    EmbeddingServiceError,
)
from src.schemas import (
    BuilderSessionCommitResponse,
    BuilderTranscriptCommitRequest,
    CardFamilyResponse,
    CommitCardDraftRequest,
    ExperienceCardChildPatch,
    ExperienceCardChildResponse,
    ExperienceCardCreate,
    ExperienceCardPatch,
    ExperienceCardResponse,
    FillFromTextRequest,
    FillFromTextResponse,
    FinalizeExperienceCardRequest,
)
from src.serializers import experience_card_child_to_response, experience_card_to_response
from src.services.builder import (
    commit_builder_transcript,
)
from src.services.experience import (
    PipelineError,
    apply_card_patch,
    apply_child_patch,
    embed_experience_cards,
    experience_card_service,
    fill_missing_fields_from_text,
)
from src.services.experience.crud import (
    create_experience_card_child,
    list_children_for_parent,
)
from src.services.experience.form_merge import (
    PARENT_MERGE_KEYS,
    merged_form,
    parent_merged_to_patch,
)
from src.services.locale_display import bump_english_content_version

logger = logging.getLogger(__name__)


async def _invalidate_localized_ui(db: AsyncSession, person_id: str) -> None:
    """Rebuild localized /me payloads after English card or bio content changes."""
    await bump_english_content_version(db, person_id)

router = APIRouter(tags=["builder"])


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _reembed_cards_after_update(
    db: AsyncSession,
    *,
    parents: list[ExperienceCard] | None = None,
    children: list[ExperienceCardChild] | None = None,
    context: str = "update",
) -> None:
    """
    Re-run embedding for the given cards after a content update.

    Logs a warning and raises ``HTTP 503`` if embedding fails so the caller
    can surface a meaningful error to the client.
    """
    parents = parents or []
    children = children or []
    if not parents and not children:
        return
    try:
        await embed_experience_cards(db, parents, children)
    except PipelineError as e:
        logger.warning("Re-embed after %s failed: %s", context, e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Embedding service temporarily unavailable. Please try again.",
        ) from e


# ---------------------------------------------------------------------------
# Fill missing fields from text
# ---------------------------------------------------------------------------

@router.post("/experience-cards/fill-missing-from-text", response_model=FillFromTextResponse)
async def fill_missing_from_text(
    body: FillFromTextRequest,
    current_user: Person = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Rewrite + fill only missing fields from text.

    If ``card_id`` is provided and ``card_type`` is ``"parent"``, the merged
    result is persisted to the DB and the card is re-embedded.
    Child cards are not auto-persisted here — the actual persist happens when
    the user clicks Done and PATCHes the full form.
    """
    try:
        filled = await fill_missing_fields_from_text(
            raw_text=body.raw_text,
            current_card=body.current_card or {},
            card_type=body.card_type or "parent",
        )
    except HTTPException:
        raise

    current = body.current_card or {}
    if body.card_id and body.card_type == "parent":
        merged = merged_form(current, filled, PARENT_MERGE_KEYS)
        card = await experience_card_service.get_card(db, body.card_id, current_user.id)
        if not card:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")
        patch = parent_merged_to_patch(merged)
        apply_card_patch(card, patch)
        await db.flush()
        await _reembed_cards_after_update(db, parents=[card], context="fill-missing (parent)")
        await _invalidate_localized_ui(db, current_user.id)

    return FillFromTextResponse(filled=filled)

@router.post("/builder/transcript/commit", response_model=BuilderSessionCommitResponse)
async def commit_builder_transcript_endpoint(
    body: BuilderTranscriptCommitRequest,
    current_user: Person = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Commit one completed Vapi transcript into experience cards."""
    try:
        result = await commit_builder_transcript(
            db,
            person_id=current_user.id,
            call_id=body.call_id,
            transcript=body.transcript,
            session_id=body.session_id,
            mode=body.mode,
        )
        await _invalidate_localized_ui(db, current_user.id)
        return BuilderSessionCommitResponse(**result)
    except HTTPException:
        raise
    except (ChatServiceError, EmbeddingServiceError, PipelineError) as e:
        logger.exception("builder transcript commit failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Builder transcript commit temporarily unavailable. Please try again.",
        ) from e


# ---------------------------------------------------------------------------
# Finalize
# ---------------------------------------------------------------------------

@router.post("/experience-cards/finalize", response_model=ExperienceCardResponse)
async def finalize_experience_card(
    body: FinalizeExperienceCardRequest,
    current_user: Person = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Finalize a drafted experience card:

    1. Verify the card belongs to the current user.
    2. Mark it visible (``experience_card_visibility = True``).
    3. Embed parent + children so the card appears in search and "Your Cards".
    """
    card = await experience_card_service.get_card(db, body.card_id, current_user.id)
    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")

    card.experience_card_visibility = True

    children_result = await db.execute(
        select(ExperienceCardChild).where(
            ExperienceCardChild.parent_experience_id == card.id,
            ExperienceCardChild.person_id == current_user.id,
        )
    )
    children = children_result.scalars().all()

    await _reembed_cards_after_update(db, parents=[card], children=children, context="finalize")
    await _invalidate_localized_ui(db, current_user.id)
    return experience_card_to_response(card)


# ---------------------------------------------------------------------------
# CRUD endpoints
# ---------------------------------------------------------------------------

@router.post("/experience-cards", response_model=ExperienceCardResponse)
async def create_experience_card(
    body: ExperienceCardCreate,
    current_user: Person = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Manually create an experience card (no AI pipeline)."""
    card = await experience_card_service.create_card(db, current_user.id, body)
    await _invalidate_localized_ui(db, current_user.id)
    return experience_card_to_response(card)


@router.patch("/experience-cards/{card_id}", response_model=ExperienceCardResponse)
async def patch_experience_card(
    body: ExperienceCardPatch,
    card: ExperienceCard = Depends(get_experience_card_or_404),
    db: AsyncSession = Depends(get_db),
):
    """Update fields on an existing experience card and re-embed."""
    apply_card_patch(card, body)
    await _reembed_cards_after_update(db, parents=[card], context="PATCH card")
    await _invalidate_localized_ui(db, card.user_id)
    return experience_card_to_response(card)


@router.post("/experience-cards/{card_id}/commit-draft", response_model=CardFamilyResponse)
async def commit_card_draft(
    card_id: str,
    body: CommitCardDraftRequest,
    current_user: Person = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Persist a full parent + children draft from the enhance editor in one transaction.

    - Applies all parent patch fields and re-embeds.
    - For each child entry with an ``id``: updates the existing row.
    - For each child entry without an ``id``: upserts by ``child_type``
      (updates the existing row for that type, or creates a new one).
    - Re-embeds parent + all children after all writes.
    - Returns the full card family so the frontend can update its cache.
    """
    card = await experience_card_service.get_card(db, card_id, current_user.id)
    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Card not found")

    # ── 1. Apply parent patch ──────────────────────────────────────────────
    await apply_card_patch(card, body.parent, db)

    # ── 2. Load all existing children for this parent ─────────────────────
    existing_children = await list_children_for_parent(
        db, parent_experience_id=card.id, person_id=current_user.id
    )
    by_id: dict[str, ExperienceCardChild] = {c.id: c for c in existing_children}
    by_type: dict[str, ExperienceCardChild] = {c.child_type: c for c in existing_children}
    new_children: list[ExperienceCardChild] = []

    # ── 3. Upsert children (batch changes, single flush) ──────────────────
    for entry in body.children:
        patch = ExperienceCardChildPatch(items=entry.items)  # type: ignore[arg-type]
        if entry.id:
            child = by_id.get(entry.id)
            if child and child.person_id == current_user.id:
                apply_child_patch(child, patch)
        else:
            existing = by_type.get(entry.child_type)
            if existing:
                apply_child_patch(existing, patch)
            else:
                new_child = await create_experience_card_child(
                    db,
                    person_id=current_user.id,
                    parent_experience_id=card.id,
                    child_type=entry.child_type,
                    items=list(entry.items),
                )
                new_children.append(new_child)
                by_id[new_child.id] = new_child
                by_type[new_child.child_type] = new_child

    # Single flush for parent patch + all child updates
    await db.flush()

    # ── 4. Re-embed parent + all children ────────────────────────────────
    # Combine existing children with newly created ones (avoids second DB query)
    all_children = list(by_id.values())
    await _reembed_cards_after_update(
        db, parents=[card], children=all_children, context="commit-draft"
    )
    await _invalidate_localized_ui(db, current_user.id)

    # ── 5. Build response ─────────────────────────────────────────────────
    from src.serializers import experience_card_child_to_response

    return CardFamilyResponse(
        parent=experience_card_to_response(card),
        children=[experience_card_child_to_response(c) for c in all_children],
    )


@router.delete("/experience-cards/{card_id}", response_model=ExperienceCardResponse)
async def delete_experience_card(
    card: ExperienceCard = Depends(get_experience_card_or_404),
    db: AsyncSession = Depends(get_db),
):
    """Delete an experience card and all its children."""
    await db.execute(
        delete(ExperienceCardChild).where(ExperienceCardChild.parent_experience_id == card.id)
    )
    response = experience_card_to_response(card)
    uid = card.user_id
    await db.delete(card)
    await _invalidate_localized_ui(db, uid)
    return response


@router.patch(
    "/experience-card-children/{child_id}",
    response_model=ExperienceCardChildResponse,
)
async def patch_experience_card_child(
    body: ExperienceCardChildPatch,
    child: ExperienceCardChild = Depends(get_experience_card_child_or_404),
    db: AsyncSession = Depends(get_db),
):
    """Update items on an existing child card and re-embed."""
    apply_child_patch(child, body)
    await _reembed_cards_after_update(db, children=[child], context="PATCH child")
    await _invalidate_localized_ui(db, child.person_id)
    return experience_card_child_to_response(child)


@router.delete(
    "/experience-card-children/{child_id}",
    response_model=ExperienceCardChildResponse,
)
async def delete_experience_card_child(
    child: ExperienceCardChild = Depends(get_experience_card_child_or_404),
    db: AsyncSession = Depends(get_db),
):
    """Delete a child card."""
    response = experience_card_child_to_response(child)
    pid = child.person_id
    await db.delete(child)
    await _invalidate_localized_ui(db, pid)
    return response
