"""add OAuth provider identity fields

Revision ID: 20261124_0002
Revises: 20261124_0001
Create Date: 2026-11-24
"""
from alembic import op
import sqlalchemy as sa

revision = "20261124_0002"
down_revision = "20261124_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("users", "hashed_password", existing_type=sa.String(length=255), nullable=True)
    op.add_column(
        "users",
        sa.Column("auth_provider", sa.String(length=32), nullable=False, server_default="local"),
    )
    op.add_column("users", sa.Column("provider_sub", sa.String(length=255), nullable=True))
    op.create_index("ix_users_provider_sub", "users", ["provider_sub"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_users_provider_sub", table_name="users")
    op.drop_column("users", "provider_sub")
    op.drop_column("users", "auth_provider")
    op.alter_column("users", "hashed_password", existing_type=sa.String(length=255), nullable=False)
