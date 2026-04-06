"""FastAPI dependency functions (DB session, current user, card lookups)."""

from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core import decode_access_token, get_settings
from src.db.models import ExperienceCard, ExperienceCardChild, Person
from src.db.session import async_session
from src.services.experience import experience_card_service

security = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------------
# Database session
# ---------------------------------------------------------------------------


async def get_db() -> AsyncGenerator[AsyncSession]:
    """Yield an async DB session; commit only when changes were made, rollback on error."""
    async with async_session() as session:
        try:
            yield session
            if session.dirty or session.new or session.deleted:
                await session.commit()
        except Exception:
            await session.rollback()
            raise


# ---------------------------------------------------------------------------
# Authentication helpers
# ---------------------------------------------------------------------------


async def resolve_user_from_user_id(
    db: AsyncSession,
    user_id: str,
) -> Person | None:
    """
    Load ``Person`` by id and enforce email-verification if required by settings.

    Returns ``None`` when the user does not exist or email verification is
    required but not completed.
    """
    result = await db.execute(select(Person).where(Person.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return None

    settings = get_settings()
    if settings.email_verification_required and not user.email_verified_at:
        return None

    return user


async def _resolve_user_from_token(
    token: str,
    db: AsyncSession,
) -> Person | None:
    """
    Decode *token*, load the matching ``Person`` from the DB, and enforce
    email-verification if required by settings.

    Returns ``None`` when the token is invalid, the user does not exist, or
    email verification is required but not completed.
    """
    user_id = decode_access_token(token)
    if not user_id:
        return None

    return await resolve_user_from_user_id(db, user_id)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Person:
    """
    Resolve the authenticated user from the Bearer token.

    Raises ``HTTP 401`` when no credentials are provided or the token is
    invalid/expired. Raises ``HTTP 403`` when email verification is required
    but not completed.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await _resolve_user_from_token(credentials.credentials, db)

    if user is None:
        # Distinguish between "token invalid" and "email not verified" so
        # callers get the correct HTTP status code.
        user_id = decode_access_token(credentials.credentials)
        if user_id:
            # Token decoded but user missing or email unverified
            settings = get_settings()
            result = await db.execute(select(Person).where(Person.id == user_id))
            raw_user = result.scalar_one_or_none()
            if raw_user and settings.email_verification_required and not raw_user.email_verified_at:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Email not verified",
                )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


# ---------------------------------------------------------------------------
# Card lookups
# ---------------------------------------------------------------------------


async def get_experience_card_or_404(
    card_id: str,
    current_user: Annotated[Person, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ExperienceCard:
    """Load an ``ExperienceCard`` by ``card_id`` for the current user, or raise 404."""
    card = await experience_card_service.get_card(db, card_id, current_user.id)
    if not card:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Card not found",
        )
    return card


async def get_experience_card_child_or_404(
    child_id: str,
    current_user: Annotated[Person, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ExperienceCardChild:
    """Load an ``ExperienceCardChild`` by ``child_id`` for the current user, or raise 404."""
    result = await db.execute(
        select(ExperienceCardChild).where(
            ExperienceCardChild.id == child_id,
            ExperienceCardChild.person_id == current_user.id,
        )
    )
    child = result.scalar_one_or_none()
    if not child:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Child card not found",
        )
    return child
