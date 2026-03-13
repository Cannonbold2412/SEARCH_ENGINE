"""Add chat conversations and messages tables.

Revision ID: 029
Revises: 028
Create Date: 2026-03-13
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import text


# revision identifiers, used by Alembic. Keep short (<=32 chars) for alembic_version.version_num.
revision: str = "029"
down_revision: Union[str, None] = "028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(conn, name: str) -> bool:
    r = conn.execute(
        text(
            "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = :name"
        ),
        {"name": name},
    ).scalar()
    return r is not None


def upgrade() -> None:
    conn = op.get_bind()
    if _table_exists(conn, "conversations"):
        return  # Already applied (e.g. from a previous failed deploy before version was updated)
    op.create_table(
        "conversations",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column(
            "person_a_id",
            postgresql.UUID(as_uuid=False),
            sa.ForeignKey("people.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "person_b_id",
            postgresql.UUID(as_uuid=False),
            sa.ForeignKey("people.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_conversations_pair_unique",
        "conversations",
        ["person_a_id", "person_b_id"],
        unique=True,
    )
    op.create_index(
        "ix_conversations_person_a",
        "conversations",
        ["person_a_id"],
        unique=False,
    )
    op.create_index(
        "ix_conversations_person_b",
        "conversations",
        ["person_b_id"],
        unique=False,
    )

    op.create_table(
        "messages",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column(
            "conversation_id",
            postgresql.UUID(as_uuid=False),
            sa.ForeignKey("conversations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "sender_id",
            postgresql.UUID(as_uuid=False),
            sa.ForeignKey("people.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_messages_conversation_created_at",
        "messages",
        ["conversation_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS messages CASCADE")
    op.execute("DROP TABLE IF EXISTS conversations CASCADE")

