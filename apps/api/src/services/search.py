"""Legacy compatibility facade for the split search service package.

The maintained implementation now lives under ``src.services.search/``.
This module keeps the historical file path importable for editors and any
older call sites without duplicating the search pipeline logic.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from src.schemas import (
    PersonListResponse,
    PersonProfileResponse,
    PersonPublicProfileResponse,
    PersonSearchResult,
    SavedSearchesResponse,
    SearchRequest,
    SearchResponse,
    UnlockContactResponse,
)


async def run_search(
    db: AsyncSession,
    searcher_id: str,
    body: SearchRequest,
    idempotency_key: str | None,
) -> SearchResponse:
    from src.services.search.search_logic import run_search as impl

    return await impl(db, searcher_id, body, idempotency_key)


async def load_search_more(
    db: AsyncSession,
    searcher_id: str,
    search_id: str,
    offset: int,
    limit: int = 6,
    skip_credits: bool = False,
    language: str = "en",
) -> list[PersonSearchResult]:
    from src.services.search.search_logic import load_search_more as impl

    return await impl(
        db,
        searcher_id,
        search_id,
        offset=offset,
        limit=limit,
        skip_credits=skip_credits,
        language=language,
    )


async def list_searches(
    db: AsyncSession,
    searcher_id: str,
    limit: int = 50,
) -> SavedSearchesResponse:
    from src.services.search.search_logic import list_searches as impl

    return await impl(db, searcher_id, limit=limit)


async def delete_search(
    db: AsyncSession,
    searcher_id: str,
    search_id: str,
) -> bool:
    from src.services.search.search_logic import delete_search as impl

    return await impl(db, searcher_id, search_id)


async def get_person_profile(
    db: AsyncSession,
    searcher_id: str,
    person_id: str,
    search_id: str | None = None,
    viewer_language: str = "en",
) -> PersonProfileResponse:
    from src.services.search.search_profile_view import get_person_profile as impl

    return await impl(db, searcher_id, person_id, search_id, viewer_language=viewer_language)


async def unlock_contact(
    db: AsyncSession,
    searcher_id: str,
    person_id: str,
    search_id: str | None,
    idempotency_key: str | None,
) -> UnlockContactResponse:
    from src.services.search.search_contact_unlock import unlock_contact as impl

    return await impl(db, searcher_id, person_id, search_id, idempotency_key)


async def list_people_for_discover(
    db: AsyncSession,
    viewer_id: str,
    viewer_language: str = "en",
) -> PersonListResponse:
    from src.services.search.search_profile_view import list_people_for_discover as impl

    return await impl(db, viewer_id, viewer_language=viewer_language)


async def get_public_profile_impl(
    db: AsyncSession,
    person_id: str,
) -> PersonPublicProfileResponse:
    from src.services.search.search_profile_view import get_public_profile_impl as impl

    return await impl(db, person_id)


class SearchService:
    """Facade for search operations."""

    @staticmethod
    async def search(
        db: AsyncSession,
        searcher_id: str,
        body: SearchRequest,
        idempotency_key: str | None,
    ) -> SearchResponse:
        return await run_search(db, searcher_id, body, idempotency_key)

    @staticmethod
    async def get_profile(
        db: AsyncSession,
        searcher_id: str,
        person_id: str,
        search_id: str | None = None,
        viewer_language: str = "en",
    ) -> PersonProfileResponse:
        return await get_person_profile(
            db, searcher_id, person_id, search_id, viewer_language=viewer_language
        )

    @staticmethod
    async def unlock(
        db: AsyncSession,
        searcher_id: str,
        person_id: str,
        search_id: str | None,
        idempotency_key: str | None,
    ) -> UnlockContactResponse:
        return await unlock_contact(db, searcher_id, person_id, search_id, idempotency_key)

    @staticmethod
    async def list_people(
        db: AsyncSession,
        viewer_id: str,
        viewer_language: str = "en",
    ) -> PersonListResponse:
        return await list_people_for_discover(db, viewer_id, viewer_language=viewer_language)

    @staticmethod
    async def get_public_profile(
        db: AsyncSession,
        person_id: str,
    ) -> PersonPublicProfileResponse:
        return await get_public_profile_impl(db, person_id)


search_service = SearchService()

__all__ = [
    "SearchService",
    "delete_search",
    "get_person_profile",
    "get_public_profile_impl",
    "list_people_for_discover",
    "list_searches",
    "load_search_more",
    "run_search",
    "search_service",
    "unlock_contact",
]
