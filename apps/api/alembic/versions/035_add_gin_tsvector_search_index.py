"""Add GIN index on stored tsvector for fast lexical search.

Revision ID: 035
Revises: 034

Previously the search pipeline computed to_tsvector(...) from a concat_ws of many
columns on every query row, with no index.  This migration adds a GENERATED ALWAYS AS
STORED tsvector column on experience_cards (and a parallel one on
experience_card_children) so that:
  1. The vector is pre-computed once on write rather than on every search.
  2. A GIN index makes @@ plainto_tsquery checks nearly instant.

The search SQL in candidates.py already falls back gracefully when the stored column
does not exist (it computes on the fly), so the migration is safe to apply
incrementally.  After applying, update candidates.py to use the stored column
(see SEARCH_DOC_SQL constants there).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "035"
down_revision: Union[str, None] = "034"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# ---------------------------------------------------------------------------
# SQL helpers
# ---------------------------------------------------------------------------

_PARENT_DOC_EXPR = """to_tsvector('english', concat_ws(' ',
    title, normalized_role, domain, sub_domain, company_name, company_type,
    location, employment_type, summary, raw_text, intent_primary,
    array_to_string(COALESCE(intent_secondary, '{}'::text[]), ' '),
    seniority_level,
    CASE WHEN start_date IS NOT NULL AND end_date IS NOT NULL THEN start_date::text || ' - ' || end_date::text
         WHEN start_date IS NOT NULL THEN start_date::text
         WHEN end_date IS NOT NULL THEN end_date::text ELSE NULL END,
    CASE WHEN is_current = true THEN 'current' ELSE NULL END
))"""

# For children, value is JSONB — the generated column concatenates common text fields.
# We use a simpler expression that only touches text-typed columns; JSONB extraction
# is done at search time via the fallback path.
_CHILD_DOC_EXPR = """to_tsvector('english', concat_ws(' ',
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
            f"""
            ALTER TABLE experience_cards
            ADD COLUMN IF NOT EXISTS search_doc tsvector
            GENERATED ALWAYS AS ({_PARENT_DOC_EXPR}) STORED
            """
        )
    )
    op.execute(
        sa.text(
            """
            CREATE INDEX CONCURRENTLY IF NOT EXISTS
            ix_experience_cards_search_doc_gin
            ON experience_cards USING GIN(search_doc)
            """
        )
    )

    # ── experience_card_children ──────────────────────────────────────────────
    op.execute(
        sa.text(
            f"""
            ALTER TABLE experience_card_children
            ADD COLUMN IF NOT EXISTS search_doc tsvector
            GENERATED ALWAYS AS ({_CHILD_DOC_EXPR}) STORED
            """
        )
    )
    op.execute(
        sa.text(
            """
            CREATE INDEX CONCURRENTLY IF NOT EXISTS
            ix_experience_card_children_search_doc_gin
            ON experience_card_children USING GIN(search_doc)
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "DROP INDEX CONCURRENTLY IF EXISTS ix_experience_card_children_search_doc_gin"
        )
    )
    op.execute(
        sa.text(
            "ALTER TABLE experience_card_children DROP COLUMN IF EXISTS search_doc"
        )
    )
    op.execute(
        sa.text(
            "DROP INDEX CONCURRENTLY IF EXISTS ix_experience_cards_search_doc_gin"
        )
    )
    op.execute(
        sa.text(
            "ALTER TABLE experience_cards DROP COLUMN IF EXISTS search_doc"
        )
    )
