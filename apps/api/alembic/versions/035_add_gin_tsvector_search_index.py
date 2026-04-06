"""Add GIN index on stored tsvector for fast lexical search.

Revision ID: 035
Revises: 034

Previously the search pipeline computed to_tsvector(...) from a concat_ws of many
columns on every query row, with no index.  This migration adds a tsvector column
on experience_cards (and a parallel one on experience_card_children) maintained by
BEFORE INSERT/UPDATE triggers so that:

  1. The vector is pre-computed on write rather than on every search.
  2. A GIN index makes @@ plainto_tsquery checks nearly instant.

We cannot use GENERATED ALWAYS AS ... STORED: PostgreSQL requires generation
expressions to be IMMUTABLE, but to_tsvector() is STABLE (dictionary-dependent).

The search SQL in candidates.py already falls back gracefully when the stored column
is NULL (it computes on the fly), so the migration is safe to apply incrementally.
After applying, candidates.py uses the stored column via COALESCE (see SEARCH_DOC
constants there).

Indexes use plain CREATE INDEX (not CONCURRENTLY) so the migration runs inside
Alembic's single transaction; CONCURRENTLY cannot run in a transaction block.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "035"
down_revision: str | None = "034"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PARENT_DOC_EXPR_NEW = """to_tsvector('english', concat_ws(' ',
    NEW.title, NEW.normalized_role, NEW.domain, NEW.sub_domain, NEW.company_name, NEW.company_type,
    NEW.location, NEW.employment_type, NEW.summary, NEW.raw_text, NEW.intent_primary,
    array_to_string(COALESCE(NEW.intent_secondary, '{}'::text[]), ' '),
    NEW.seniority_level,
    CASE WHEN NEW.start_date IS NOT NULL AND NEW.end_date IS NOT NULL THEN NEW.start_date::text || ' - ' || NEW.end_date::text
         WHEN NEW.start_date IS NOT NULL THEN NEW.start_date::text
         WHEN NEW.end_date IS NOT NULL THEN NEW.end_date::text ELSE NULL END,
    CASE WHEN NEW.is_current = true THEN 'current' ELSE NULL END
))"""

_PARENT_DOC_EXPR_TABLE = """to_tsvector('english', concat_ws(' ',
    title, normalized_role, domain, sub_domain, company_name, company_type,
    location, employment_type, summary, raw_text, intent_primary,
    array_to_string(COALESCE(intent_secondary, '{}'::text[]), ' '),
    seniority_level,
    CASE WHEN start_date IS NOT NULL AND end_date IS NOT NULL THEN start_date::text || ' - ' || end_date::text
         WHEN start_date IS NOT NULL THEN start_date::text
         WHEN end_date IS NOT NULL THEN end_date::text ELSE NULL END,
    CASE WHEN is_current = true THEN 'current' ELSE NULL END
))"""

_CHILD_DOC_EXPR_NEW = """to_tsvector('english', concat_ws(' ',
    (NEW.value->>'raw_text'),
    (NEW.value->>'summary'),
    (NEW.value->'items'->0->>'title'),
    (NEW.value->'items'->0->>'subtitle'),
    (NEW.value->'items'->0->>'description')
))"""

_CHILD_DOC_EXPR_TABLE = """to_tsvector('english', concat_ws(' ',
    (value->>'raw_text'),
    (value->>'summary'),
    (value->'items'->0->>'title'),
    (value->'items'->0->>'subtitle'),
    (value->'items'->0->>'description')
))"""


def upgrade() -> None:
    # ── experience_cards ──────────────────────────────────────────────────────
    op.execute(
        sa.text(
            """
            ALTER TABLE experience_cards
            ADD COLUMN IF NOT EXISTS search_doc tsvector
            """
        )
    )
    op.execute(
        sa.text(
            f"""
            CREATE OR REPLACE FUNCTION conxa_experience_cards_set_search_doc()
            RETURNS trigger
            LANGUAGE plpgsql
            SET search_path = public
            AS $$
            BEGIN
              NEW.search_doc := {_PARENT_DOC_EXPR_NEW};
              RETURN NEW;
            END;
            $$;
            """
        )
    )
    op.execute(
        sa.text(
            f"""
            UPDATE experience_cards SET search_doc = {_PARENT_DOC_EXPR_TABLE}
            """
        )
    )
    op.execute(
        sa.text(
            """
            DROP TRIGGER IF EXISTS trg_experience_cards_search_doc ON experience_cards
            """
        )
    )
    op.execute(
        sa.text(
            """
            CREATE TRIGGER trg_experience_cards_search_doc
            BEFORE INSERT OR UPDATE ON experience_cards
            FOR EACH ROW
            EXECUTE PROCEDURE conxa_experience_cards_set_search_doc()
            """
        )
    )
    op.execute(
        sa.text(
            """
            CREATE INDEX IF NOT EXISTS ix_experience_cards_search_doc_gin
            ON experience_cards USING GIN(search_doc)
            """
        )
    )

    # ── experience_card_children ──────────────────────────────────────────────
    op.execute(
        sa.text(
            """
            ALTER TABLE experience_card_children
            ADD COLUMN IF NOT EXISTS search_doc tsvector
            """
        )
    )
    op.execute(
        sa.text(
            f"""
            CREATE OR REPLACE FUNCTION conxa_experience_card_children_set_search_doc()
            RETURNS trigger
            LANGUAGE plpgsql
            SET search_path = public
            AS $$
            BEGIN
              NEW.search_doc := {_CHILD_DOC_EXPR_NEW};
              RETURN NEW;
            END;
            $$;
            """
        )
    )
    op.execute(
        sa.text(
            f"""
            UPDATE experience_card_children SET search_doc = {_CHILD_DOC_EXPR_TABLE}
            """
        )
    )
    op.execute(
        sa.text(
            """
            DROP TRIGGER IF EXISTS trg_experience_card_children_search_doc
            ON experience_card_children
            """
        )
    )
    op.execute(
        sa.text(
            """
            CREATE TRIGGER trg_experience_card_children_search_doc
            BEFORE INSERT OR UPDATE ON experience_card_children
            FOR EACH ROW
            EXECUTE PROCEDURE conxa_experience_card_children_set_search_doc()
            """
        )
    )
    op.execute(
        sa.text(
            """
            CREATE INDEX IF NOT EXISTS ix_experience_card_children_search_doc_gin
            ON experience_card_children USING GIN(search_doc)
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DROP TRIGGER IF EXISTS trg_experience_card_children_search_doc
            ON experience_card_children
            """
        )
    )
    op.execute(
        sa.text(
            "DROP FUNCTION IF EXISTS conxa_experience_card_children_set_search_doc()"
        )
    )
    op.execute(
        sa.text(
            "DROP INDEX IF EXISTS ix_experience_card_children_search_doc_gin"
        )
    )
    op.execute(
        sa.text(
            "ALTER TABLE experience_card_children DROP COLUMN IF EXISTS search_doc"
        )
    )

    op.execute(
        sa.text(
            """
            DROP TRIGGER IF EXISTS trg_experience_cards_search_doc ON experience_cards
            """
        )
    )
    op.execute(
        sa.text("DROP FUNCTION IF EXISTS conxa_experience_cards_set_search_doc()")
    )
    op.execute(
        sa.text("DROP INDEX IF EXISTS ix_experience_cards_search_doc_gin")
    )
    op.execute(
        sa.text("ALTER TABLE experience_cards DROP COLUMN IF EXISTS search_doc")
    )
