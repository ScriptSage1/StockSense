"""initial schema

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-09-26
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.db.models.ledger import LEDGER_IMMUTABLE_FUNCTION, LEDGER_IMMUTABLE_TRIGGER

revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

UUID = postgresql.UUID(as_uuid=True)
TS = sa.DateTime(timezone=True)
QTY = sa.Numeric(14, 3)


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", TS, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", TS, server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("full_name", sa.String(120), nullable=False),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.UniqueConstraint("email", name="uq_users_email"),
        sa.CheckConstraint("role IN ('manager', 'staff')", name="ck_users_user_role"),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "refresh_tokens",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE",
                                                 name="fk_refresh_tokens_user_id_users"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", TS, nullable=False),
        sa.Column("revoked_at", TS, nullable=True),
        sa.Column("created_at", TS, nullable=False),
        sa.Column("user_agent", sa.String(255), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_refresh_tokens"),
        sa.UniqueConstraint("token_hash", name="uq_refresh_tokens_token_hash"),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])

    op.create_table(
        "warehouses",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("short_code", sa.String(10), nullable=False),
        sa.Column("address", sa.String(500), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_warehouses"),
        sa.UniqueConstraint("short_code", name="uq_warehouses_short_code"),
    )

    op.create_table(
        "locations",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("short_code", sa.String(20), nullable=False),
        sa.Column("warehouse_id", UUID, sa.ForeignKey("warehouses.id", ondelete="RESTRICT",
                                                      name="fk_locations_warehouse_id_warehouses"), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_locations"),
        sa.UniqueConstraint("warehouse_id", "short_code", name="uq_locations_warehouse_id_short_code"),
    )
    op.create_index("ix_locations_warehouse_id", "locations", ["warehouse_id"])

    op.create_table(
        "categories",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("name", sa.String(80), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_categories"),
        sa.UniqueConstraint("name", name="uq_categories_name"),
    )

    op.create_table(
        "products",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("sku", sa.String(64), nullable=False),
        sa.Column("category_id", UUID, sa.ForeignKey("categories.id", ondelete="SET NULL",
                                                     name="fk_products_category_id_categories"), nullable=True),
        sa.Column("unit_of_measure", sa.String(20), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_products"),
        sa.UniqueConstraint("sku", name="uq_products_sku"),
    )
    op.create_index("ix_products_sku", "products", ["sku"])
    op.create_index("ix_products_category_id", "products", ["category_id"])

    op.create_table(
        "stock",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("product_id", UUID, sa.ForeignKey("products.id", ondelete="RESTRICT",
                                                    name="fk_stock_product_id_products"), nullable=False),
        sa.Column("location_id", UUID, sa.ForeignKey("locations.id", ondelete="RESTRICT",
                                                     name="fk_stock_location_id_locations"), nullable=False),
        sa.Column("quantity", QTY, nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_stock"),
        sa.UniqueConstraint("product_id", "location_id", name="uq_stock_product_id_location_id"),
        sa.CheckConstraint("quantity >= 0", name="ck_stock_quantity_non_negative"),
    )
    op.create_index("ix_stock_product_id", "stock", ["product_id"])
    op.create_index("ix_stock_location_id", "stock", ["location_id"])

    op.create_table(
        "reorder_rules",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("product_id", UUID, sa.ForeignKey("products.id", ondelete="CASCADE",
                                                    name="fk_reorder_rules_product_id_products"), nullable=False),
        sa.Column("location_id", UUID, sa.ForeignKey("locations.id", ondelete="CASCADE",
                                                     name="fk_reorder_rules_location_id_locations"), nullable=True),
        sa.Column("reorder_point", QTY, nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_reorder_rules"),
        sa.UniqueConstraint("product_id", "location_id", name="uq_reorder_rules_product_id_location_id",
                            postgresql_nulls_not_distinct=True),
        sa.CheckConstraint("reorder_point >= 0", name="ck_reorder_rules_reorder_point_non_negative"),
    )

    op.create_table(
        "operations",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("reference", sa.String(40), nullable=False),
        sa.Column("type", sa.String(16), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("supplier_or_customer", sa.String(200), nullable=True),
        sa.Column("source_location_id", UUID, sa.ForeignKey("locations.id", ondelete="RESTRICT",
                                                            name="fk_operations_source_location_id_locations"),
                  nullable=True),
        sa.Column("destination_location_id", UUID,
                  sa.ForeignKey("locations.id", ondelete="RESTRICT",
                                name="fk_operations_destination_location_id_locations"), nullable=True),
        sa.Column("scheduled_date", sa.Date, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_by_id", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT",
                                                       name="fk_operations_created_by_id_users"), nullable=False),
        sa.Column("validated_at", TS, nullable=True),
        sa.Column("validated_by_id", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT",
                                                         name="fk_operations_validated_by_id_users"), nullable=True),
        sa.Column("canceled_at", TS, nullable=True),
        sa.Column("canceled_by_id", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT",
                                                        name="fk_operations_canceled_by_id_users"), nullable=True),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_operations"),
        sa.UniqueConstraint("reference", name="uq_operations_reference"),
        sa.CheckConstraint("type IN ('receipt', 'delivery', 'transfer', 'adjustment')",
                           name="ck_operations_operation_type"),
        sa.CheckConstraint("status IN ('draft', 'waiting', 'ready', 'done', 'canceled')",
                           name="ck_operations_operation_status"),
        sa.CheckConstraint(
            "(type <> 'transfer') OR (source_location_id IS NULL) OR (destination_location_id IS NULL) "
            "OR (source_location_id <> destination_location_id)",
            name="ck_operations_transfer_distinct_locations",
        ),
    )
    op.create_index("ix_operations_type_status", "operations", ["type", "status"])
    op.create_index("ix_operations_created_by_id", "operations", ["created_by_id"])
    op.create_index("ix_operations_scheduled_date", "operations", ["scheduled_date"])

    op.create_table(
        "operation_lines",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("operation_id", UUID, sa.ForeignKey("operations.id", ondelete="CASCADE",
                                                      name="fk_operation_lines_operation_id_operations"),
                  nullable=False),
        sa.Column("product_id", UUID, sa.ForeignKey("products.id", ondelete="RESTRICT",
                                                    name="fk_operation_lines_product_id_products"), nullable=False),
        sa.Column("quantity", QTY, nullable=False),
        sa.Column("position", sa.Integer, nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_operation_lines"),
        sa.UniqueConstraint("operation_id", "product_id", name="uq_operation_lines_operation_id_product_id"),
        sa.CheckConstraint("quantity >= 0", name="ck_operation_lines_quantity_non_negative"),
    )
    op.create_index("ix_operation_lines_operation_id", "operation_lines", ["operation_id"])

    op.create_table(
        "ledger_entries",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("operation_id", UUID, sa.ForeignKey("operations.id", ondelete="RESTRICT",
                                                      name="fk_ledger_entries_operation_id_operations"),
                  nullable=False),
        sa.Column("product_id", UUID, sa.ForeignKey("products.id", ondelete="RESTRICT",
                                                    name="fk_ledger_entries_product_id_products"), nullable=False),
        sa.Column("from_location_id", UUID, sa.ForeignKey("locations.id", ondelete="RESTRICT",
                                                          name="fk_ledger_entries_from_location_id_locations"),
                  nullable=True),
        sa.Column("to_location_id", UUID, sa.ForeignKey("locations.id", ondelete="RESTRICT",
                                                        name="fk_ledger_entries_to_location_id_locations"),
                  nullable=True),
        sa.Column("quantity", QTY, nullable=False),
        sa.Column("type", sa.String(16), nullable=False),
        sa.Column("performed_by_id", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT",
                                                         name="fk_ledger_entries_performed_by_id_users"),
                  nullable=False),
        sa.Column("performed_at", TS, server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_ledger_entries"),
        sa.CheckConstraint("quantity <> 0", name="ck_ledger_entries_quantity_non_zero"),
        sa.CheckConstraint("from_location_id IS NOT NULL OR to_location_id IS NOT NULL",
                           name="ck_ledger_entries_has_location"),
        sa.CheckConstraint("type IN ('receipt', 'delivery', 'transfer', 'adjustment')",
                           name="ck_ledger_entries_ledger_type"),
    )
    op.create_index("ix_ledger_entries_product_id", "ledger_entries", ["product_id"])
    op.create_index("ix_ledger_entries_performed_at", "ledger_entries", [sa.text("performed_at DESC")])
    op.create_index("ix_ledger_entries_operation_id", "ledger_entries", ["operation_id"])
    op.execute(LEDGER_IMMUTABLE_FUNCTION)
    op.execute(LEDGER_IMMUTABLE_TRIGGER)

    op.create_table(
        "otp_records",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE",
                                                 name="fk_otp_records_user_id_users"), nullable=False),
        sa.Column("otp_hash", sa.String(255), nullable=False),
        sa.Column("attempt_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("is_used", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("expires_at", TS, nullable=False),
        sa.Column("created_at", TS, server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_otp_records"),
        sa.CheckConstraint("attempt_count >= 0", name="ck_otp_records_attempt_count_non_negative"),
    )
    op.create_index("ix_otp_records_user_id", "otp_records", ["user_id"])


def downgrade() -> None:
    op.drop_table("otp_records")
    op.execute("DROP TRIGGER IF EXISTS trg_ledger_entries_immutable ON ledger_entries")
    op.execute("DROP FUNCTION IF EXISTS ledger_entries_immutable()")
    op.drop_table("ledger_entries")
    op.drop_table("operation_lines")
    op.drop_table("operations")
    op.drop_table("reorder_rules")
    op.drop_table("stock")
    op.drop_table("products")
    op.drop_table("categories")
    op.drop_table("locations")
    op.drop_table("warehouses")
    op.drop_table("refresh_tokens")
    op.drop_table("users")
