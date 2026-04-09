"""Add preferred_language column to person_profiles.

Revision ID: 032
Revises: 031

Stores BCP-47 language code (e.g., 'en', 'hi', 'es') for user language preferences.
Defaults to 'en' for all existing and new users.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "032"
down_revision: Union[str, None] = "031"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "person_profiles",
        sa.Column(
            "preferred_language",
            sa.String(10),
            nullable=False,
            server_default="en",
        ),
    )


def downgrade() -> None:
    op.drop_column("person_profiles", "preferred_language")
