"""
Builder router — experience card pipeline endpoints.

Thin HTTP layer: validates input, delegates to services, returns responses.
All business logic (form merging, patch building) lives in the service layer.
"""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.models import Person, ExperienceCard, ExperienceCardChild
from src.dependencies import (
    get_current_user,
    get_db,
    get_experience_card_or_404,
    get_experience_card_child_or_404,
)
from src.schemas import (
    RawExperienceCreate,
    RawExperienceResponse,
    RewriteTextResponse,
    DraftSetResponse,
    DetectExperiencesResponse,
    DraftSingleRequest,
    FillFromTextRequest,
    FillFromTextResponse,
    ClarifyExperienceRequest,
    ClarifyExperienceResponse,
    BuilderChatTurnRequest,
    BuilderChatTurnResponse,
    BuilderSessionResponse,
    BuilderSessionCommitResponse,
    DraftCardFamily,
    ExperienceCardCreate,
    ExperienceCardPatch,
    ExperienceCardResponse,
    ExperienceCardChildPatch,
    ExperienceCardChildResponse,
    FinalizeExperienceCardRequest,
)
from src.services.builder import (
    commit_builder_session,
    get_builder_session_state,
    process_builder_turn,
)
from src.providers import (
    ChatServiceError,
    ChatRateLimitError,
    EmbeddingServiceError,
)
from src.serializers import experience_card_to_response, experience_card_child_to_response
from src.services.experience import (
    experience_card_service,
    apply_card_patch,
    apply_child_patch,
    embed_experience_cards,
    rewrite_raw_text,
    run_draft_single,
    fill_missing_fields_from_text,
    clarify_experience_interactive,
    detect_experiences,
    DEFAULT_MAX_PARENT_CLARIFY,
    DEFAULT_MAX_CHILD_CLARIFY,
    PipelineError,
)
from src.services.experience.form_merge import (
    merged_form,
    parent_merged_to_patch,
    child_merged_to_patch,
    PARENT_MERGE_KEYS,
    CHILD_MERGE_KEYS,
)

logger = logging.getLogger(__name__)

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
# Raw experience
# ---------------------------------------------------------------------------

@router.post("/experiences/raw", response_model=RawExperienceResponse)
async def create_raw_experience(
    body: RawExperienceCreate,
    current_user: Person = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save raw experience text for the current user (no AI processing)."""
    raw = await experience_card_service.create_raw(db, current_user.id, body)
    return RawExperienceResponse(id=raw.id, raw_text=raw.raw_text, created_at=raw.created_at)


# ---------------------------------------------------------------------------
# Rewrite
# ---------------------------------------------------------------------------

@router.post("/experiences/rewrite", response_model=RewriteTextResponse)
async def rewrite_experience_text(
    body: RawExperienceCreate,
    current_user: Person = Depends(get_current_user),
):
    """Rewrite messy input into clear English for easier extraction. No persistence."""
    try:
        rewritten = await rewrite_raw_text(body.raw_text)
        return RewriteTextResponse(rewritten_text=rewritten)
    except ChatRateLimitError as e:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(e))
    except ChatServiceError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service temporarily unavailable. Please try again.",
        )


# ---------------------------------------------------------------------------
# Detect experiences
# ---------------------------------------------------------------------------

@router.post("/experience-cards/detect-experiences", response_model=DetectExperiencesResponse)
async def detect_experiences_endpoint(
    body: RawExperienceCreate,
    current_user: Person = Depends(get_current_user),
):
    """Analyse text and return the count + list of distinct experiences for the user to choose from."""
    try:
        result = await detect_experiences(body.raw_text or "")
        return DetectExperiencesResponse(
            count=result.get("count", 0),
            experiences=[
                {
                    "index": e["index"],
                    "label": e["label"],
                    "suggested": e.get("suggested", False),
                }
                for e in result.get("experiences", [])
            ],
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("detect-experiences failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Experience detection temporarily unavailable. Please try again.",
        )


# ---------------------------------------------------------------------------
# Draft single experience
# ---------------------------------------------------------------------------

@router.post("/experience-cards/draft-single", response_model=DraftSetResponse)
async def create_draft_single_experience(
    body: DraftSingleRequest,
    current_user: Person = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Extract and draft ONE experience by index (1-based). Process one experience at a time."""
    try:
        draft_set_id, raw_experience_id, card_families = await run_draft_single(
            db,
            current_user.id,
            body.raw_text or "",
            body.experience_index,
            body.experience_count or 1,
        )
        return DraftSetResponse(
            draft_set_id=draft_set_id,
            raw_experience_id=raw_experience_id,
            card_families=[
                DraftCardFamily(parent=f["parent"], children=f["children"])
                for f in card_families
            ],
        )
    except (ChatServiceError, EmbeddingServiceError, PipelineError) as e:
        logger.exception("draft-single pipeline failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Draft pipeline temporarily unavailable. Please try again.",
        )
    except RuntimeError as e:
        logger.warning("draft-single pipeline config error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service configuration error. Please try again.",
        )


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

    return FillFromTextResponse(filled=filled)


# ---------------------------------------------------------------------------
# Clarify experience
# ---------------------------------------------------------------------------

@router.post("/experience-cards/clarify-experience", response_model=ClarifyExperienceResponse)
async def clarify_experience(
    body: ClarifyExperienceRequest,
    current_user: Person = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Interactive clarification: planner → validate → question writer / answer applier.

    When the LLM returns filled fields and a ``card_id`` / ``child_id`` is
    provided, the merged result is persisted to the DB and re-embedded.
    """
    conv = [{"role": m.role, "content": m.content} for m in body.conversation_history]
    max_parent = (
        body.max_parent_questions
        if body.max_parent_questions is not None
        else DEFAULT_MAX_PARENT_CLARIFY
    )
    max_child = (
        body.max_child_questions
        if body.max_child_questions is not None
        else DEFAULT_MAX_CHILD_CLARIFY
    )

    try:
        result = await clarify_experience_interactive(
            raw_text=body.raw_text,
            current_card=body.current_card or {},
            card_type=body.card_type or "parent",
            conversation_history=conv,
            card_family=body.card_family,
            asked_history_structured=body.asked_history,
            last_question_target=body.last_question_target,
            max_parent=max_parent,
            max_child=max_child,
            card_families=body.card_families,
            focus_parent_id=body.focus_parent_id,
            detected_experiences=body.detected_experiences,
        )
    except HTTPException:
        raise

    filled = result.get("filled") or {}
    current = body.current_card or {}

    if filled and body.card_id and body.card_type == "parent":
        merged = merged_form(current, filled, PARENT_MERGE_KEYS)
        card = await experience_card_service.get_card(db, body.card_id, current_user.id)
        if card:
            patch = parent_merged_to_patch(merged)
            apply_card_patch(card, patch)
            await db.flush()
            await _reembed_cards_after_update(db, parents=[card], context="clarify (parent)")

    if filled and body.child_id and body.card_type == "child":
        merged = merged_form(current, filled, CHILD_MERGE_KEYS)
        child_result = await db.execute(
            select(ExperienceCardChild).where(
                ExperienceCardChild.id == body.child_id,
                ExperienceCardChild.person_id == current_user.id,
            )
        )
        child = child_result.scalar_one_or_none()
        if child:
            patch = child_merged_to_patch(merged)
            apply_child_patch(child, patch)
            await db.flush()
            await _reembed_cards_after_update(db, children=[child], context="clarify (child)")

    return ClarifyExperienceResponse(
        clarifying_question=result.get("clarifying_question") or None,
        filled=filled,
        profile_update=result.get("profile_update"),
        profile_reflection=result.get("profile_reflection"),
        action=result.get("action"),
        message=result.get("message"),
        options=result.get("options"),
        focus_parent_id=result.get("focus_parent_id"),
        should_stop=result.get("should_stop"),
        stop_reason=result.get("stop_reason"),
        target_type=result.get("target_type"),
        target_field=result.get("target_field"),
        target_child_type=result.get("target_child_type"),
        progress=result.get("progress"),
        missing_fields=result.get("missing_fields"),
        asked_history_entry=result.get("asked_history_entry"),
        canonical_family=result.get("canonical_family"),
    )


# ---------------------------------------------------------------------------
# Conversation-first Builder
# ---------------------------------------------------------------------------

@router.post("/builder/chat/turn", response_model=BuilderChatTurnResponse)
async def builder_chat_turn(
    body: BuilderChatTurnRequest,
    current_user: Person = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Single conversation endpoint for the redesigned Builder experience."""
    try:
        result = await process_builder_turn(
            db,
            person_id=current_user.id,
            message=body.message,
            session_id=body.session_id,
            mode=body.mode,
        )
        return BuilderChatTurnResponse(**result)
    except HTTPException:
        raise
    except (ChatServiceError, EmbeddingServiceError, PipelineError) as e:
        logger.exception("builder chat turn failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Builder conversation temporarily unavailable. Please try again.",
        ) from e


@router.get("/builder/session/{session_id}", response_model=BuilderSessionResponse)
async def get_builder_session(
    session_id: str,
    current_user: Person = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the current visible state of a Builder session."""
    result = await get_builder_session_state(
        db,
        person_id=current_user.id,
        session_id=session_id,
    )
    return BuilderSessionResponse(**result)


@router.post("/builder/session/{session_id}/commit", response_model=BuilderSessionCommitResponse)
async def commit_builder_session_endpoint(
    session_id: str,
    current_user: Person = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Project a Builder session into the existing experience-card schema."""
    try:
        result = await commit_builder_session(
            db,
            person_id=current_user.id,
            session_id=session_id,
        )
        return BuilderSessionCommitResponse(**result)
    except HTTPException:
        raise
    except (ChatServiceError, EmbeddingServiceError, PipelineError) as e:
        logger.exception("builder session commit failed: %s", e)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Builder commit temporarily unavailable. Please try again.",
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
    return experience_card_to_response(card)


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
    await db.delete(card)
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
    await db.delete(child)
    return response
