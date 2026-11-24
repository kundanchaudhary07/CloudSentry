"""add multi-user isolation

Revision ID: 20261124_0001
Revises: 8fb7fb814fed
Create Date: 2026-11-24
"""
from alembic import op
import sqlalchemy as sa

revision = "20261124_0001"
down_revision = "8fb7fb814fed"
branch_labels = None
depends_on = None

DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000001"


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.execute(
        sa.text(
            "INSERT INTO users (id, email, full_name, hashed_password, is_active, created_at) "
            "VALUES (CAST(:id AS UUID), 'legacy@cloudsentry.local', 'Legacy Operator', "
            "'!disabled!', true, now())"
        ).bindparams(id=DEFAULT_USER_ID)
    )

    op.create_table(
        "user_aws_credentials",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("aws_access_key_id", sa.String(length=128), nullable=False),
        sa.Column("encrypted_secret_access_key", sa.Text(), nullable=False),
        sa.Column("aws_default_region", sa.String(length=64), nullable=False),
        sa.Column("aws_role_arn", sa.String(length=512), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index("ix_user_aws_credentials_user_id", "user_aws_credentials", ["user_id"], unique=False)

    op.create_table(
        "scan_settings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("regions", sa.JSON(), nullable=False),
        sa.Column("include_cost_explorer", sa.Boolean(), nullable=False),
        sa.Column("cpu_threshold", sa.Float(), nullable=False),
        sa.Column("lookback_days", sa.Integer(), nullable=False),
        sa.Column("required_tags", sa.JSON(), nullable=False),
        sa.Column("required_cost_tags", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index("ix_scan_settings_user_id", "scan_settings", ["user_id"], unique=False)

    op.create_table(
        "cost_snapshots",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("scan_id", sa.Uuid(), nullable=False),
        sa.Column("report", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["scan_id"], ["scans.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_cost_snapshots_user_id", "cost_snapshots", ["user_id"], unique=False)
    op.create_index("ix_cost_snapshots_user_scan", "cost_snapshots", ["user_id", "scan_id"], unique=False)

    for table in ("scans", "resources", "findings", "remediation_history"):
        op.add_column(table, sa.Column("user_id", sa.Uuid(), nullable=True))
        op.create_index(f"ix_{table}_user_id", table, ["user_id"], unique=False)
        op.execute(
            sa.text(f"UPDATE {table} SET user_id = CAST(:id AS UUID)").bindparams(id=DEFAULT_USER_ID)
        )
        op.alter_column(table, "user_id", existing_type=sa.Uuid(), nullable=False)
        op.create_foreign_key(
            f"fk_{table}_user_id_users",
            table,
            "users",
            ["user_id"],
            ["id"],
            ondelete="CASCADE",
        )


def downgrade() -> None:
    for table in ("scans", "resources", "findings", "remediation_history"):
        op.drop_constraint(f"fk_{table}_user_id_users", table, type_="foreignkey")
        op.drop_index(f"ix_{table}_user_id", table_name=table)
        op.drop_column(table, "user_id")
    op.drop_index("ix_cost_snapshots_user_scan", table_name="cost_snapshots")
    op.drop_index("ix_cost_snapshots_user_id", table_name="cost_snapshots")
    op.drop_table("cost_snapshots")
    op.drop_index("ix_scan_settings_user_id", table_name="scan_settings")
    op.drop_table("scan_settings")
    op.drop_index("ix_user_aws_credentials_user_id", table_name="user_aws_credentials")
    op.drop_table("user_aws_credentials")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
