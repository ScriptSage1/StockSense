"""seed reference data: product categories + default warehouse and its stock location

Revision ID: 0002_seed_reference_data
Revises: 0001_initial_schema
Create Date: 2026-09-26

Idempotent: only inserts rows that do not exist yet. No users are seeded here.
"""
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_seed_reference_data"
down_revision: Union[str, None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CATEGORIES = ["Raw Materials", "Components", "Finished Goods", "Consumables", "Packaging"]


def upgrade() -> None:
    conn = op.get_bind()
    for name in CATEGORIES:
        conn.execute(
            sa.text("INSERT INTO categories (id, name) VALUES (:id, :name) ON CONFLICT (name) DO NOTHING"),
            {"id": uuid.uuid4(), "name": name},
        )

    wh_id = conn.execute(sa.text("SELECT id FROM warehouses WHERE short_code = 'WH'")).scalar()
    if wh_id is None:
        wh_id = uuid.uuid4()
        conn.execute(
            sa.text("INSERT INTO warehouses (id, name, short_code, address, is_active) "
                    "VALUES (:id, 'Main Warehouse', 'WH', NULL, true)"),
            {"id": wh_id},
        )
    conn.execute(
        sa.text("INSERT INTO locations (id, name, short_code, warehouse_id, is_active) "
                "VALUES (:id, 'Stock', 'STOCK', :wh, true) "
                "ON CONFLICT ON CONSTRAINT uq_locations_warehouse_id_short_code DO NOTHING"),
        {"id": uuid.uuid4(), "wh": wh_id},
    )


def downgrade() -> None:
    # Reference data may be in use by products/operations; leave it in place.
    pass
