"""OTP authentication: email verification on users, purpose on OTP records

Revision ID: 0003_otp_authentication
Revises: 0002_seed_reference_data
Create Date: 2026-09-26

Every sign-in, registration and password change now ends with a one-time code sent by email.
Existing accounts are marked verified so nobody is locked out by the upgrade.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_otp_authentication"
down_revision: Union[str, None] = "0002_seed_reference_data"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL")

    op.add_column(
        "otp_records",
        sa.Column("purpose", sa.String(24), nullable=False, server_default="password_reset"),
    )
    op.create_check_constraint(
        op.f("ck_otp_records_purpose_valid"),
        "otp_records",
        "purpose IN ('password_reset', 'login', 'register', 'password_change')",
    )
    op.create_index("ix_otp_records_user_id_purpose", "otp_records", ["user_id", "purpose"])


def downgrade() -> None:
    op.drop_index("ix_otp_records_user_id_purpose", table_name="otp_records")
    op.drop_constraint(op.f("ck_otp_records_purpose_valid"), "otp_records", type_="check")
    op.drop_column("otp_records", "purpose")
    op.drop_column("users", "email_verified_at")
