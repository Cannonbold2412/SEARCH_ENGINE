"""SQLAlchemy ORM models for the CONXA API."""

import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import (
    Column,
    LargeBinary,
    String,
    Text,
    Boolean,
    Integer,
    Numeric,
    Float,
    Date,
    DateTime,
    ForeignKey,
    Index,
    func,
)
from sqlalchemy.dialects.postgresql import UUID, ARRAY, JSONB
from sqlalchemy.orm import relationship, synonym

from .session import Base

from pgvector.sqlalchemy import Vector

# ---------------------------------------------------------------------------
# Column-width constants
# ---------------------------------------------------------------------------
# Centralise all String() lengths so they can be changed in one place.

_S20 = 20    # short codes (date_of_birth, status flags)
_S50 = 50    # media types, reference types
_S100 = 100  # reason / endpoint labels
_S255 = 255  # standard short text (names, emails, urls)
_S500 = 500  # longer urls (LinkedIn)
_S1000 = 1000  # profile photo urls

# Starting wallet balance awarded on signup (credits).
DEFAULT_WALLET_BALANCE = 1_000

# Embedding vector dimension — must match src.core.constants.EMBEDDING_DIM.
# Defined here as a plain int so SQLAlchemy can use it without importing from core.
_EMBEDDING_DIM = 324


def uuid4_str() -> str:
    """Generate a new UUID-4 string (used as column default)."""
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# People
# ---------------------------------------------------------------------------

class Person(Base):
    """Registered user account. Holds credentials and links to profile/cards."""

    __tablename__ = "people"

    id = Column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    email = Column(String(_S255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(_S255), nullable=False)
    display_name = Column(String(_S255), nullable=True)
    email_verified_at = Column(DateTime(timezone=True), nullable=True)
    email_verification_token_hash = Column(String(_S255), nullable=True)
    email_verification_expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))

    profile = relationship("PersonProfile", back_populates="person", uselist=False)
    raw_experiences = relationship("RawExperience", back_populates="person")
    draft_sets = relationship("DraftSet", back_populates="person")
    experience_cards = relationship("ExperienceCard", back_populates="person")
    experience_card_children = relationship("ExperienceCardChild", back_populates="person")
    searches_made = relationship("Search", back_populates="searcher", foreign_keys="Search.searcher_id")


class PersonProfile(Base):
    """Merged profile: bio + visibility + contact prefs + wallet balance (one row per person)."""

    __tablename__ = "person_profiles"

    id = Column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    person_id = Column(
        UUID(as_uuid=False),
        ForeignKey("people.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    # Bio
    first_name = Column(String(_S255), nullable=True)
    last_name = Column(String(_S255), nullable=True)
    date_of_birth = Column(String(_S20), nullable=True)
    current_city = Column(String(_S255), nullable=True)
    profile_photo_url = Column(String(_S1000), nullable=True)
    profile_photo = Column(LargeBinary, nullable=True)
    profile_photo_media_type = Column(String(_S50), nullable=True)
    school = Column(String(_S255), nullable=True)
    college = Column(String(_S255), nullable=True)
    current_company = Column(String(_S255), nullable=True)
    past_companies = Column(JSONB, nullable=True)

    # Visibility
    open_to_work = Column(Boolean, default=False)
    work_preferred_locations = Column(ARRAY(String), default=list)
    work_preferred_salary_min = Column(Numeric(12, 2), nullable=True)  # minimum salary needed (₹/year)
    open_to_contact = Column(Boolean, default=False)

    # Contact
    email_visible = Column(Boolean, default=True)
    phone = Column(String(_S50), nullable=True)
    linkedin_url = Column(String(_S500), nullable=True)
    # Free-form contact notes (e.g. preferred contact method, Telegram handle).
    # Column is named `other` in the DB for historical reasons.
    other = Column(Text, nullable=True)

    # Wallet — starting balance awarded on signup
    balance = Column(Integer, default=DEFAULT_WALLET_BALANCE, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))

    person = relationship("Person", back_populates="profile")


# ---------------------------------------------------------------------------
# Credits
# ---------------------------------------------------------------------------

class CreditLedger(Base):
    """Append-only ledger of credit transactions per person."""

    __tablename__ = "credit_ledger"

    id = Column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    person_id = Column(
        UUID(as_uuid=False),
        ForeignKey("people.id", ondelete="CASCADE"),
        nullable=False,
    )
    amount = Column(Integer, nullable=False)          # negative for debit
    reason = Column(String(_S100), nullable=False)    # e.g. "signup", "search", "unlock_contact"
    reference_type = Column(String(_S50), nullable=True)   # e.g. "search_id", "unlock_id"
    reference_id = Column(UUID(as_uuid=False), nullable=True)
    balance_after = Column(Integer, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (Index("ix_credit_ledger_person_id", "person_id"),)


class IdempotencyKey(Base):
    """Stores responses for idempotent endpoints (search, unlock-contact)."""

    __tablename__ = "idempotency_keys"

    id = Column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    key = Column(String(_S255), nullable=False, index=True)
    person_id = Column(
        UUID(as_uuid=False),
        ForeignKey("people.id", ondelete="CASCADE"),
        nullable=False,
    )
    endpoint = Column(String(_S100), nullable=False)
    response_status = Column(Integer, nullable=True)
    response_body = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index(
            "ix_idempotency_keys_key_person_endpoint",
            "key", "person_id", "endpoint",
            unique=True,
        ),
    )


# ---------------------------------------------------------------------------
# Signup
# ---------------------------------------------------------------------------

class SignupSession(Base):
    """Temporary session for the email-verification signup flow."""

    __tablename__ = "signup_sessions"

    id = Column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    email = Column(String(_S255), nullable=False, index=True)
    password_hash = Column(String(_S255), nullable=False)
    display_name = Column(String(_S255), nullable=True)
    status = Column(String(_S20), nullable=False, default="pending")
    attempts = Column(Integer, nullable=False, default=0)
    send_count = Column(Integer, nullable=False, default=0)
    last_sent_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    verified_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_signup_sessions_email_status", "email", "status"),
        Index("ix_signup_sessions_expires_at", "expires_at"),
    )


# ---------------------------------------------------------------------------
# Experience pipeline
# ---------------------------------------------------------------------------

class RawExperience(Base):
    """Raw text submitted by a user before AI processing."""

    __tablename__ = "raw_experiences"

    id = Column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    person_id = Column(
        UUID(as_uuid=False),
        ForeignKey("people.id", ondelete="CASCADE"),
        nullable=False,
    )
    raw_text = Column(Text, nullable=False)
    raw_text_original = Column(Text, nullable=True)
    raw_text_cleaned = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    person = relationship("Person", back_populates="raw_experiences")
    draft_sets = relationship("DraftSet", back_populates="raw_experience")


class DraftSet(Base):
    """Groups the experience cards produced from one pipeline run on a RawExperience."""

    __tablename__ = "draft_sets"

    id = Column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    person_id = Column(
        UUID(as_uuid=False),
        ForeignKey("people.id", ondelete="CASCADE"),
        nullable=False,
    )
    raw_experience_id = Column(
        UUID(as_uuid=False),
        ForeignKey("raw_experiences.id", ondelete="CASCADE"),
        nullable=False,
    )
    run_version = Column(Integer, nullable=False, default=1)
    # Python attribute is `extra_metadata`; DB column is named `metadata` for historical reasons.
    extra_metadata = Column("metadata", JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    person = relationship("Person", back_populates="draft_sets")
    raw_experience = relationship("RawExperience", back_populates="draft_sets")
    experience_card_children = relationship("ExperienceCardChild", back_populates="draft_set")
    experience_cards = relationship("ExperienceCard", back_populates="draft_set")


class ExperienceCard(Base):
    """
    Parent experience card — one structured experience entry per person.

    Visibility: ``experience_card_visibility=True`` means the card is public and
    searchable; ``False`` means it is a draft not yet shown in search results.
    """

    __tablename__ = "experience_cards"

    id = Column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    person_id = Column(
        UUID(as_uuid=False),
        ForeignKey("people.id", ondelete="CASCADE"),
        nullable=False,
    )
    draft_set_id = Column(
        UUID(as_uuid=False),
        ForeignKey("draft_sets.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Backward-compat alias so older code using `card.user_id` still works.
    user_id = synonym("person_id")

    title = Column(Text, nullable=True)
    normalized_role = Column(Text, nullable=True)

    domain = Column(Text, nullable=True)
    domain_norm = Column(String(_S255), nullable=True, index=True)
    sub_domain = Column(Text, nullable=True)
    sub_domain_norm = Column(String(_S255), nullable=True, index=True)

    company_name = Column(Text, nullable=True)
    company_norm = Column(String(_S255), nullable=True, index=True)  # lowercased/trimmed for exact match
    company_type = Column(Text, nullable=True)
    team = Column(Text, nullable=True)
    team_norm = Column(String(_S255), nullable=True, index=True)    # lowercased/trimmed for ILIKE

    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    is_current = Column(Boolean, nullable=True)

    location = Column(Text, nullable=True)
    city = Column(String(_S255), nullable=True)
    country = Column(String(_S255), nullable=True)
    is_remote = Column(Boolean, nullable=True)
    employment_type = Column(Text, nullable=True)

    summary = Column(Text, nullable=True)
    raw_text = Column(Text, nullable=True)

    intent_primary = Column(Text, nullable=True)
    intent_secondary = Column(ARRAY(String), default=list)

    seniority_level = Column(Text, nullable=True)

    confidence_score = Column(Float, nullable=True)
    experience_card_visibility = Column(Boolean, default=True, nullable=False)
    embedding = Column(Vector(_EMBEDDING_DIM), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))

    person = relationship("Person", back_populates="experience_cards")
    draft_set = relationship("DraftSet", back_populates="experience_cards")
    children = relationship(
        "ExperienceCardChild",
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

    id = Column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    parent_experience_id = Column(
        UUID(as_uuid=False),
        ForeignKey("experience_cards.id", ondelete="CASCADE"),
        nullable=False,
    )
    person_id = Column(
        UUID(as_uuid=False),
        ForeignKey("people.id", ondelete="CASCADE"),
        nullable=False,
    )
    raw_experience_id = Column(
        UUID(as_uuid=False),
        ForeignKey("raw_experiences.id", ondelete="SET NULL"),
        nullable=True,
    )
    draft_set_id = Column(
        UUID(as_uuid=False),
        ForeignKey("draft_sets.id", ondelete="SET NULL"),
        nullable=True,
    )

    child_type = Column(String(_S50), nullable=False)
    value = Column(JSONB, nullable=False)  # { raw_text, items: [{ title, description }] }

    confidence_score = Column(Float, nullable=True)
    embedding = Column(Vector(_EMBEDDING_DIM), nullable=True)
    extra = Column(JSONB, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))

    person = relationship("Person", back_populates="experience_card_children")
    draft_set = relationship("DraftSet", back_populates="experience_card_children")
    experience = relationship("ExperienceCard", back_populates="children")

    __table_args__ = (
        Index(
            "uq_experience_card_child_type",
            "parent_experience_id", "child_type",
            unique=True,
        ),
    )


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

class Search(Base):
    """A saved search query with its parsed constraints and expiry."""

    __tablename__ = "searches"

    id = Column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    searcher_id = Column(
        UUID(as_uuid=False),
        ForeignKey("people.id", ondelete="CASCADE"),
        nullable=False,
    )
    query_text = Column(Text, nullable=False)
    parsed_constraints_json = Column(JSONB, nullable=True)
    filters = Column(JSONB, nullable=True)   # legacy / extra
    extra = Column(JSONB, nullable=True)     # e.g. fallback_tier for MUST relaxation
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)

    searcher = relationship("Person", back_populates="searches_made", foreign_keys=[searcher_id])
    results = relationship("SearchResult", back_populates="search")


class SearchResult(Base):
    """One person result row within a Search, including score and why_matched."""

    __tablename__ = "search_results"

    id = Column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    search_id = Column(
        UUID(as_uuid=False),
        ForeignKey("searches.id", ondelete="CASCADE"),
        nullable=False,
    )
    person_id = Column(
        UUID(as_uuid=False),
        ForeignKey("people.id", ondelete="CASCADE"),
        nullable=False,
    )
    rank = Column(Integer, nullable=False)
    score = Column(Numeric(10, 6), nullable=True)
    # JSONB payload: { matched_parent_ids, matched_child_ids, why_matched }
    extra = Column(JSONB, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    search = relationship("Search", back_populates="results")

    __table_args__ = (
        Index("ix_search_results_search_person", "search_id", "person_id", unique=True),
    )


class UnlockContact(Base):
    """Records that a searcher has paid to reveal a target person's contact details."""

    __tablename__ = "unlock_contacts"

    id = Column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    searcher_id = Column(
        UUID(as_uuid=False),
        ForeignKey("people.id", ondelete="CASCADE"),
        nullable=False,
    )
    target_person_id = Column(
        UUID(as_uuid=False),
        ForeignKey("people.id", ondelete="CASCADE"),
        nullable=False,
    )
    search_id = Column(
        UUID(as_uuid=False),
        ForeignKey("searches.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index(
            "ix_unlock_contacts_searcher_target",
            "searcher_id", "target_person_id", "search_id",
            unique=True,
        ),
    )
