"""Add composite indexes for common query patterns.

Revision ID: 036
Revises: 035

Adds indexes for two frequently used query patterns:
1. experience_card_children: (parent_experience_id, person_id) - used when loading
   children for a list of parent IDs in search results and card families.
2. searches: (searcher_id) - used in load_search_more and list_saved_searches.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "036"
down_revision: Union[str, None] = "035"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Composite index for "load children for a list of parent IDs" pattern
    op.execute(
        sa.text(
            """
            CREATE INDEX CONCURRENTLY IF NOT EXISTS
            ix_experience_card_children_parent_person
            ON experience_card_children (parent_experience_id, person_id)
            """
        )
    )

    # Index for searches by searcher (used in load_search_more, list_saved_searches)
    op.execute(
        sa.text(
            """
            CREATE INDEX CONCURRENTLY IF NOT EXISTS
            ix_searches_searcher_id
            ON searches (searcher_id)
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "DROP INDEX CONCURRENTLY IF EXISTS ix_searches_searcher_id"
        )
    )
    op.execute(
        sa.text(
            "DROP INDEX CONCURRENTLY IF EXISTS ix_experience_card_children_parent_person"
        )
    )
