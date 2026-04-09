"""SQLAlchemy ORM models for the CONXA API."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    ARRAY,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship, synonym

from .session import Base

# ---------------------------------------------------------------------------
# Column-width constants
# ---------------------------------------------------------------------------
# Centralise all String() lengths so they can be changed in one place.

_S20 = 20  # short codes (date_of_birth, status flags)
_S50 = 50  # media types, reference types
_S100 = 100  # reason / endpoint labels
_S255 = 255  # standard short text (names, emails, urls)
_S500 = 500  # longer urls (LinkedIn)
_S1000 = 1000  # profile photo urls

# Starting wallet balance awarded on signup (credits).
DEFAULT_WALLET_BALANCE = 1_000

# Embedding vector dimension â€” must match src.core.constants.EMBEDDING_DIM.
# Defined here as a plain int so SQLAlchemy can use it without importing from core.
_EMBEDDING_DIM = 324


JSONDict = dict[str, Any]
JSONArray = list[Any]
JSONValue = JSONDict | JSONArray
PastCompaniesValue = list[dict[str, Any]]
ChildCardValue = dict[str, Any]


def uuid4_str() -> str:
    """Generate a new UUID-4 string (used as column default)."""
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# People
# ---------------------------------------------------------------------------


class Person(Base):
    """Registered user account. Holds credentials and links to profile/cards."""

    __tablename__ = "people"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    email: Mapped[str] = mapped_column(String(_S255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(_S255), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(_S255), nullable=True)
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    email_verification_token_hash: Mapped[str | None] = mapped_column(String(_S255), nullable=True)
    email_verification_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        onupdate=lambda: datetime.now(UTC),
    )

    profile: Mapped[PersonProfile | None] = relationship(back_populates="person", uselist=False)
    experience_cards: Mapped[list[ExperienceCard]] = relationship(back_populates="person")
    experience_card_children: Mapped[list[ExperienceCardChild]] = relationship(
        back_populates="person"
    )
    searches_made: Mapped[list[Search]] = relationship(
        back_populates="searcher",
        foreign_keys="Search.searcher_id",
    )


class PersonProfile(Base):
    """Merged profile: bio + visibility + contact prefs + wallet balance (one row per person)."""

    __tablename__ = "person_profiles"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    person_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("people.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    # Bio
    first_name: Mapped[str | None] = mapped_column(String(_S255), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(_S255), nullable=True)
    date_of_birth: Mapped[str | None] = mapped_column(String(_S20), nullable=True)
    current_city: Mapped[str | None] = mapped_column(String(_S255), nullable=True)
    profile_photo_url: Mapped[str | None] = mapped_column(String(_S1000), nullable=True)
    profile_photo: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    profile_photo_media_type: Mapped[str | None] = mapped_column(String(_S50), nullable=True)
    school: Mapped[str | None] = mapped_column(String(_S255), nullable=True)
    college: Mapped[str | None] = mapped_column(String(_S255), nullable=True)
    current_company: Mapped[str | None] = mapped_column(String(_S255), nullable=True)
    past_companies: Mapped[PastCompaniesValue | None] = mapped_column(JSONB, nullable=True)

    # Visibility
    open_to_work: Mapped[bool] = mapped_column(Boolean, default=False)
    work_preferred_locations: Mapped[list[str] | None] = mapped_column(ARRAY(String), default=list)
    work_preferred_salary_min: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 2),
        nullable=True,
    )
    open_to_contact: Mapped[bool] = mapped_column(Boolean, default=False)

    # Contact
    email_visible: Mapped[bool] = mapped_column(Boolean, default=True)
    phone: Mapped[str | None] = mapped_column(String(_S50), nullable=True)
    linkedin_url: Mapped[str | None] = mapped_column(String(_S500), nullable=True)
    # Free-form contact notes (e.g. preferred contact method, Telegram handle).
    # Column is named `other` in the DB for historical reasons.
    other: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Wallet â€” starting balance awarded on signup
    balance: Mapped[int] = mapped_column(Integer, default=DEFAULT_WALLET_BALANCE, nullable=False)

    # Language preference (BCP-47 language code, e.g., 'en', 'hi', 'es')
    preferred_language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)
    # Bumped when English source content changes; invalidates localized_ui_cache.
    english_content_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Cached translated profile + cards for preferred_language (see locale_display).
    localized_ui_cache: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        onupdate=lambda: datetime.now(UTC),
    )

    person: Mapped[Person] = relationship(back_populates="profile")


# ---------------------------------------------------------------------------
# Credits
# ---------------------------------------------------------------------------


class CreditLedger(Base):
    """Append-only ledger of credit transactions per person."""

    __tablename__ = "credit_ledger"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    person_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("people.id", ondelete="CASCADE"),
        nullable=False,
    )
    amount: Mapped[int] = mapped_column(Integer, nullable=False)  # negative for debit
    reason: Mapped[str] = mapped_column(String(_S100), nullable=False)
    reference_type: Mapped[str | None] = mapped_column(String(_S50), nullable=True)
    reference_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), nullable=True)
    balance_after: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (Index("ix_credit_ledger_person_id", "person_id"),)


class IdempotencyKey(Base):
    """Stores responses for idempotent endpoints (search, unlock-contact)."""

    __tablename__ = "idempotency_keys"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    key: Mapped[str] = mapped_column(String(_S255), nullable=False, index=True)
    person_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("people.id", ondelete="CASCADE"),
        nullable=False,
    )
    endpoint: Mapped[str] = mapped_column(String(_S100), nullable=False)
    response_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    response_body: Mapped[JSONValue | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index(
            "ix_idempotency_keys_key_person_endpoint",
            "key",
            "person_id",
            "endpoint",
            unique=True,
        ),
    )


# ---------------------------------------------------------------------------
# Experience pipeline
# ---------------------------------------------------------------------------


class ExperienceCard(Base):
    """
    Parent experience card â€” one structured experience entry per person.

    Visibility: ``experience_card_visibility=True`` means the card is public and
    searchable; ``False`` means it is a draft not yet shown in search results.
    """

    __tablename__ = "experience_cards"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    person_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("people.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Backward-compat alias so older code using `card.user_id` still works.
    user_id = synonym("person_id")

    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    normalized_role: Mapped[str | None] = mapped_column(Text, nullable=True)

    domain: Mapped[str | None] = mapped_column(Text, nullable=True)
    domain_norm: Mapped[str | None] = mapped_column(String(_S255), nullable=True, index=True)
    sub_domain: Mapped[str | None] = mapped_column(Text, nullable=True)
    sub_domain_norm: Mapped[str | None] = mapped_column(String(_S255), nullable=True, index=True)

    company_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    company_norm: Mapped[str | None] = mapped_column(String(_S255), nullable=True, index=True)
    company_type: Mapped[str | None] = mapped_column(Text, nullable=True)
    team: Mapped[str | None] = mapped_column(Text, nullable=True)
    team_norm: Mapped[str | None] = mapped_column(String(_S255), nullable=True, index=True)

    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_current: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    location: Mapped[str | None] = mapped_column(Text, nullable=True)
    city: Mapped[str | None] = mapped_column(String(_S255), nullable=True)
    country: Mapped[str | None] = mapped_column(String(_S255), nullable=True)
    is_remote: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    employment_type: Mapped[str | None] = mapped_column(Text, nullable=True)

    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    intent_primary: Mapped[str | None] = mapped_column(Text, nullable=True)
    intent_secondary: Mapped[list[str] | None] = mapped_column(ARRAY(String), default=list)

    seniority_level: Mapped[str | None] = mapped_column(Text, nullable=True)

    confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    experience_card_visibility: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    embedding: Mapped[Any | None] = mapped_column(Vector(_EMBEDDING_DIM), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        onupdate=lambda: datetime.now(UTC),
    )

    person: Mapped[Person] = relationship(back_populates="experience_cards")
    children: Mapped[list[ExperienceCardChild]] = relationship(
        back_populates="experience",
        cascade="all, delete-orphan",
    )

    __table_args__ = (Index("ix_experience_card_parent", "person_id"),)


class ExperienceCardChild(Base):
    """
    Child (dimension) card attached to a parent ExperienceCard.

    ``value`` is a JSONB container: ``{ raw_text, items: [{ title, description }] }``.
    ``child_type`` is one of the values in ``domain.ALLOWED_CHILD_TYPES``.
    """

    __tablename__ = "experience_card_children"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    parent_experience_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("experience_cards.id", ondelete="CASCADE"),
        nullable=False,
    )
    person_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("people.id", ondelete="CASCADE"),
        nullable=False,
    )
    child_type: Mapped[str] = mapped_column(String(_S50), nullable=False)
    value: Mapped[ChildCardValue] = mapped_column(JSONB, nullable=False)

    confidence_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    embedding: Mapped[Any | None] = mapped_column(Vector(_EMBEDDING_DIM), nullable=True)
    extra: Mapped[JSONDict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        onupdate=lambda: datetime.now(UTC),
    )

    person: Mapped[Person] = relationship(back_populates="experience_card_children")
    experience: Mapped[ExperienceCard] = relationship(back_populates="children")

    __table_args__ = (
        Index(
            "uq_experience_card_child_type",
            "parent_experience_id",
            "child_type",
            unique=True,
        ),
    )


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------


class Search(Base):
    """A saved search query with its parsed constraints and expiry."""

    __tablename__ = "searches"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    searcher_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("people.id", ondelete="CASCADE"),
        nullable=False,
    )
    query_text: Mapped[str] = mapped_column(Text, nullable=False)
    parsed_constraints_json: Mapped[JSONDict | None] = mapped_column(JSONB, nullable=True)
    extra: Mapped[JSONDict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    searcher: Mapped[Person] = relationship(
        back_populates="searches_made", foreign_keys=[searcher_id]
    )
    results: Mapped[list[SearchResult]] = relationship(back_populates="search")


class SearchResult(Base):
    """One person result row within a Search, including score and why_matched."""

    __tablename__ = "search_results"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    search_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("searches.id", ondelete="CASCADE"),
        nullable=False,
    )
    person_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("people.id", ondelete="CASCADE"),
        nullable=False,
    )
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    score: Mapped[Decimal | None] = mapped_column(Numeric(10, 6), nullable=True)
    # JSONB payload: { matched_parent_ids, matched_child_ids, why_matched }
    extra: Mapped[JSONDict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    search: Mapped[Search] = relationship(back_populates="results")

    __table_args__ = (
        Index("ix_search_results_search_person", "search_id", "person_id", unique=True),
    )


class UnlockContact(Base):
    """Records that a searcher has paid to reveal a target person's contact details."""

    __tablename__ = "unlock_contacts"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    searcher_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("people.id", ondelete="CASCADE"),
        nullable=False,
    )
    target_person_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("people.id", ondelete="CASCADE"),
        nullable=False,
    )
    search_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("searches.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index(
            "ix_unlock_contacts_searcher_target",
            "searcher_id",
            "target_person_id",
            "search_id",
            unique=True,
        ),
    )


# ---------------------------------------------------------------------------
# Chat (1:1 conversations)
# ---------------------------------------------------------------------------


class Conversation(Base):
    """Direct chat conversation between two people.

    We model 1:1 chats only. The pair (person_a_id, person_b_id) is stored in a
    canonical order (min, max) so lookups are symmetric regardless of who
    started the chat.
    """

    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    person_a_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("people.id", ondelete="CASCADE"),
        nullable=False,
    )
    person_b_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("people.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index(
            "ix_conversations_pair_unique",
            "person_a_id",
            "person_b_id",
            unique=True,
        ),
        Index("ix_conversations_person_a", "person_a_id"),
        Index("ix_conversations_person_b", "person_b_id"),
    )


class Message(Base):
    """Individual chat message within a conversation."""

    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    conversation_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
    )
    sender_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("people.id", ondelete="CASCADE"),
        nullable=False,
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_messages_conversation_created_at", "conversation_id", "created_at"),
    )


# ---------------------------------------------------------------------------
# Translation Cache
# ---------------------------------------------------------------------------


class TranslationCache(Base):
    """
    Cache for translated text to avoid re-translating the same content.
    Key: hash(source_text) + source_lang + target_lang
    """

    __tablename__ = "translation_cache"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    text_hash: Mapped[str] = mapped_column(String(64), nullable=False)  # SHA-256 hash
    source_lang: Mapped[str] = mapped_column(String(10), nullable=False)  # BCP-47 code
    target_lang: Mapped[str] = mapped_column(String(10), nullable=False)  # BCP-47 code
    source_text: Mapped[str] = mapped_column(Text, nullable=False)
    translated_text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    accessed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=lambda: datetime.now(UTC),
    )

    __table_args__ = (
        Index(
            "ix_translation_cache_lookup",
            "text_hash",
            "source_lang",
            "target_lang",
            unique=True,
        ),
    )
