"""Add translation_cache table for translate_with_cache.

Revision ID: 034
Revises: 033

Dedupes per-string translations (hash + source/target lang).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "034"
down_revision: Union[str, None] = "033"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "translation_cache",
        sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True),
        sa.Column("text_hash", sa.String(64), nullable=False),
        sa.Column("source_lang", sa.String(10), nullable=False),
        sa.Column("target_lang", sa.String(10), nullable=False),
        sa.Column("source_text", sa.Text(), nullable=False),
        sa.Column("translated_text", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "accessed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_translation_cache_lookup",
        "translation_cache",
        ["text_hash", "source_lang", "target_lang"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_translation_cache_lookup", table_name="translation_cache")
    op.drop_table("translation_cache")
