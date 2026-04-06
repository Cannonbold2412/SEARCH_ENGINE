"""Add composite indexes for common query patterns.

Revision ID: 036
Revises: 035

Adds indexes for two frequently used query patterns:
1. experience_card_children: (parent_experience_id, person_id) - used when loading
   children for a list of parent IDs in search results and card families.
2. searches: (searcher_id) - used in load_search_more and list_saved_searches.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "036"
down_revision: str | None = "035"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Composite index for "load children for a list of parent IDs" pattern
    # (Plain CREATE INDEX — not CONCURRENTLY — so this runs inside Alembic's transaction.)
    op.execute(
        sa.text(
            """
            CREATE INDEX IF NOT EXISTS
            ix_experience_card_children_parent_person
            ON experience_card_children (parent_experience_id, person_id)
            """
        )
    )

    # Index for searches by searcher (used in load_search_more, list_saved_searches)
    op.execute(
        sa.text(
            """
            CREATE INDEX IF NOT EXISTS
            ix_searches_searcher_id
            ON searches (searcher_id)
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "DROP INDEX IF EXISTS ix_searches_searcher_id"
        )
    )
    op.execute(
        sa.text(
            "DROP INDEX IF EXISTS ix_experience_card_children_parent_person"
        )
    )
