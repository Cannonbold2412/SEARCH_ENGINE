"""Add conversation-first Builder session tables.

Revision ID: 030
Revises: 029
Create Date: 2026-03-17
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text
from sqlalchemy.dialects import postgresql


revision: str = "030"
down_revision: Union[str, None] = "029"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(conn, name: str) -> bool:
    result = conn.execute(
        text(
            "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = :name"
        ),
        {"name": name},
    ).scalar()
    return result is not None


def upgrade() -> None:
    conn = op.get_bind()

    if not _table_exists(conn, "builder_sessions"):
        op.create_table(
            "builder_sessions",
            sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
            sa.Column(
                "person_id",
                postgresql.UUID(as_uuid=False),
                sa.ForeignKey("people.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("mode", sa.String(length=20), nullable=False, server_default="text"),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="discovering"),
            sa.Column("current_focus", sa.Text(), nullable=True),
            sa.Column("working_narrative", sa.Text(), nullable=True),
            sa.Column("turn_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("stop_confidence", sa.Float(), nullable=False, server_default="0"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_index(
            "ix_builder_sessions_person_status",
            "builder_sessions",
            ["person_id", "status"],
            unique=False,
        )

    if not _table_exists(conn, "builder_turns"):
        op.create_table(
            "builder_turns",
            sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
            sa.Column(
                "session_id",
                postgresql.UUID(as_uuid=False),
                sa.ForeignKey("builder_sessions.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("role", sa.String(length=20), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("turn_index", sa.Integer(), nullable=False),
            sa.Column("message_type", sa.String(length=50), nullable=False, server_default="story"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
        )
        op.create_index(
            "ix_builder_turns_session_turn",
            "builder_turns",
            ["session_id", "turn_index"],
            unique=True,
        )

    if not _table_exists(conn, "builder_hidden_states"):
        op.create_table(
            "builder_hidden_states",
            sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
            sa.Column(
                "session_id",
                postgresql.UUID(as_uuid=False),
                sa.ForeignKey("builder_sessions.id", ondelete="CASCADE"),
                nullable=False,
                unique=True,
            ),
            sa.Column("candidate_facts_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("evidence_spans_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("hidden_strengths_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("opportunity_hypotheses_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("missing_high_value_signals_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("possible_experience_boundaries_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("schema_patch_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("confidence_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS builder_hidden_states CASCADE")
    op.execute("DROP TABLE IF EXISTS builder_turns CASCADE")
    op.execute("DROP TABLE IF EXISTS builder_sessions CASCADE")
