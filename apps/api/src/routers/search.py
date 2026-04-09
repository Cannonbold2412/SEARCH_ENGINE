from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from src.core import get_settings, limiter
from src.db.models import Person
from src.dependencies import get_current_user, get_db
from src.schemas import (
    PersonListResponse,
    PersonProfileResponse,
    PersonPublicProfileResponse,
    PersonSearchResult,
    SavedSearchesResponse,
    SearchRequest,
    SearchResponse,
    UnlockContactRequest,
    UnlockContactResponse,
    UnlockedCardsResponse,
)
from src.services.profile import profile_service
from src.services.search import (
    delete_search,
    list_searches,
    load_search_more,
    run_search,
)
from src.services.search.search_contact_unlock import (
    unlock_contact as unlock_contact_service,
)
from src.services.search.search_profile_view import (
    get_person_profile,
    get_public_profile_impl,
    list_people_for_discover,
    list_unlocked_cards_for_searcher,
)

router = APIRouter(tags=["search"])
_settings = get_settings()


@router.get("/people", response_model=PersonListResponse)
async def list_people(
    language: str = Query(
        "en",
        description="Viewer BCP-47 code; names, locations, and summaries translated from English",
    ),
    current_user: Person = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List people for discover grid: name, location, top 5 experience titles."""
    return await list_people_for_discover(
        db, current_user.id, viewer_language=language
    )


@router.get("/me/searches", response_model=SavedSearchesResponse)
async def list_saved_searches(
    current_user: Person = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(
        50, ge=1, le=200, description="Max number of searches to return (newest first)"
    ),
):
    """List search history for the current user with result counts."""
    return await list_searches(db, current_user.id, limit=limit)


@router.delete("/me/searches/{search_id}", status_code=204)
async def delete_saved_search(
    search_id: str,
    current_user: Person = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a saved search. Returns 204 on success, 404 if not found."""
    deleted = await delete_search(db, current_user.id, search_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Search not found")
    return Response(status_code=204)


@router.get("/me/unlocked-cards", response_model=UnlockedCardsResponse)
async def list_unlocked_cards(
    language: str = Query(
        "en",
        description="Viewer BCP-47 code; names, locations, and summaries translated from English",
    ),
    current_user: Person = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all unique people whose contact details were unlocked by current user."""
    return await list_unlocked_cards_for_searcher(
        db, current_user.id, viewer_language=language
    )


@router.get("/people/{person_id}/profile", response_model=PersonPublicProfileResponse)
async def get_person_public_profile(
    person_id: str,
    current_user: Person = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Public profile for person detail page: full bio + all experience card families (parent → children)."""
    return await get_public_profile_impl(db, person_id)


@router.post("/search", response_model=SearchResponse)
@limiter.limit(_settings.search_rate_limit)
async def search(
    request: Request,
    body: SearchRequest,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    current_user: Person = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await run_search(db, current_user.id, body, idempotency_key)


class SearchMoreResponse(BaseModel):
    people: list[PersonSearchResult]


@router.get("/search/{search_id}/more", response_model=SearchMoreResponse)
async def search_more(
    search_id: str,
    offset: int = Query(0, ge=0, description="Number of results to skip"),
    limit: int = Query(
        6,
        ge=1,
        le=24,
        description="Number of results to return (max 24 for viewing saved search history)",
    ),
    history: bool = Query(
        False, description="When true, viewing from saved history - no credit deduction"
    ),
    language: str = Query(
        "en",
        description="BCP-47 code; matched cards and snippets are translated from English for the viewer",
    ),
    current_user: Person = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch more search results. Use offset=6 for second page, offset=12 for third, etc. When history=true, no credits are charged (results already unlocked)."""
    people = await load_search_more(
        db,
        current_user.id,
        search_id,
        offset=offset,
        limit=limit,
        skip_credits=history,
        language=language,
    )
    return SearchMoreResponse(people=people)


@router.get("/people/{person_id}/photo")
async def get_person_photo(
    person_id: str,
    current_user: Person = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Serve profile photo for a person. Requires Bearer auth."""
    photo = await profile_service.get_profile_photo_from_db(db, person_id)
    if not photo:
        raise HTTPException(status_code=404, detail="No profile photo")
    content, media_type = photo
    return Response(content=content, media_type=media_type)


@router.get("/people/{person_id}", response_model=PersonProfileResponse)
async def get_person(
    person_id: str,
    search_id: str | None = Query(None),
    language: str = Query(
        "en",
        description="Viewer BCP-47 code; bio and experience cards translated from English",
    ),
    current_user: Person = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_person_profile(
        db, current_user.id, person_id, search_id, viewer_language=language
    )


@router.post("/people/{person_id}/unlock-contact", response_model=UnlockContactResponse)
@limiter.limit(_settings.unlock_rate_limit)
async def unlock_contact(
    request: Request,
    person_id: str,
    body: UnlockContactRequest,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    current_user: Person = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await unlock_contact_service(
        db,
        current_user.id,
        person_id,
        body.search_id,
        idempotency_key,
    )
