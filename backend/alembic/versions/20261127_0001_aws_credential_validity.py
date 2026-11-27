"""track AWS credential validity

Revision ID: 20261127_0001
Revises: 20261124_0002
Create Date: 2026-11-27
"""
from alembic import op

revision = "20261127_0001"
down_revision = "20261124_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE user_aws_credentials "
        "ADD COLUMN IF NOT EXISTS is_valid BOOLEAN NOT NULL DEFAULT TRUE"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE user_aws_credentials DROP COLUMN IF EXISTS is_valid"
    )
