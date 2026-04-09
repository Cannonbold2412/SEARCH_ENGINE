"""Add english_content_version and localized_ui_cache to person_profiles.

Revision ID: 033
Revises: 032

Supports locale_display.get_or_build_localized_pack: versioned JSON cache of
translated profile/cards when preferred_language is not English.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "033"
down_revision: Union[str, None] = "032"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "person_profiles",
        sa.Column(
            "english_content_version",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "person_profiles",
        sa.Column("localized_ui_cache", JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("person_profiles", "localized_ui_cache")
    op.drop_column("person_profiles", "english_content_version")
