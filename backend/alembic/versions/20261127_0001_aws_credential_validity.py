"""track AWS credential validity

Revision ID: 20261127_0001
Revises: 20261124_0002
Create Date: 2026-11-27
"""
from alembic import op
import sqlalchemy as sa

revision = "20261127_0001"
down_revision = "20261124_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_aws_credentials",
        sa.Column("is_valid", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column("user_aws_credentials", "is_valid")
