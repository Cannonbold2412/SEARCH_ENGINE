"""Drop legacy raw/draft and builder session tables.

Revision ID: 031
Revises: 030

The redesigned Builder no longer relies on:
- legacy raw/draft pipeline persistence lineage
- backend-managed builder conversation memory tables

So we safely remove those tables and associated nullable FK columns.
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import text


# revision identifiers, used by Alembic. Keep short for alembic_version.version_num.
revision: str = "031"
down_revision: Union[str, None] = "030"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(conn, name: str) -> bool:
    return (
        conn.execute(
            text(
                "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = :name"
            ),
            {"name": name},
        ).scalar()
        is not None
    )


def upgrade() -> None:
    conn = op.get_bind()

    # Drop FK columns first (CASCADE is used below for table drops).
    op.execute("ALTER TABLE experience_card_children DROP COLUMN IF EXISTS raw_experience_id")
    op.execute("ALTER TABLE experience_card_children DROP COLUMN IF EXISTS draft_set_id")
    op.execute("ALTER TABLE experience_cards DROP COLUMN IF EXISTS draft_set_id")

    # Drop legacy lineage tables.
    if _table_exists(conn, "raw_experiences"):
        op.execute("DROP TABLE raw_experiences CASCADE")

    if _table_exists(conn, "draft_sets"):
        op.execute("DROP TABLE draft_sets CASCADE")

    # Drop now-unused backend builder memory tables.
    if _table_exists(conn, "builder_hidden_states"):
        op.execute("DROP TABLE builder_hidden_states CASCADE")
    if _table_exists(conn, "builder_turns"):
        op.execute("DROP TABLE builder_turns CASCADE")
    if _table_exists(conn, "builder_sessions"):
        op.execute("DROP TABLE builder_sessions CASCADE")


def downgrade() -> None:
    # Data-loss migration; cannot reliably restore previous state.
    pass

