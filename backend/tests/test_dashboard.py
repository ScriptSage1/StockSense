from __future__ import annotations

import pytest

from tests.test_operations import API, create_op, receive

pytestmark = pytest.mark.asyncio


async def test_summary_aggregation(client, manager, world) -> None:
    h = manager["headers"]
    # desk: 3 on hand, reorder point 5 → low. chair: 0 → out of stock.
    await receive(client, h, world["loc_a"]["id"], world["desk"]["id"], 3)
    await create_op(client, h, type="receipt", destination_location_id=world["loc_a"]["id"],
                    scheduled_date="2020-01-01", lines=[{"product_id": world["chair"]["id"], "quantity": 1}])
    await create_op(client, h, type="delivery", source_location_id=world["loc_a"]["id"],
                    lines=[{"product_id": world["desk"]["id"], "quantity": 2}])
    await create_op(client, h, type="delivery", source_location_id=world["loc_a"]["id"],
                    lines=[{"product_id": world["chair"]["id"], "quantity": 2}])
    await create_op(client, h, type="transfer", source_location_id=world["loc_a"]["id"],
                    destination_location_id=world["loc_b"]["id"],
                    lines=[{"product_id": world["desk"]["id"], "quantity": 1}])
    canceled = await create_op(client, h, type="receipt", destination_location_id=world["loc_a"]["id"],
                               lines=[{"product_id": world["desk"]["id"], "quantity": 1}])
    await client.post(f"{API}/{canceled['id']}/cancel", headers=h)

    r = await client.get("/api/v1/dashboard/summary", headers=h)
    assert r.status_code == 200
    s = r.json()
    assert s["total_products"] == 2
    assert s["products_in_stock"] == 1
    assert s["total_units"] == 3
    assert s["low_stock_count"] == 1
    assert s["out_of_stock_count"] == 1
    assert s["pending_receipts"] == 1
    assert s["receipts"]["late"] == 1
    assert s["pending_deliveries"] == 2
    assert s["deliveries"]["ready"] == 1 and s["deliveries"]["waiting"] == 1
    assert s["scheduled_transfers"] == 1
    assert s["status_counts"]["done"] == 1 and s["status_counts"]["canceled"] == 1
    assert {i["sku"] for i in s["low_stock_items"]} == {"DESK001", "CHAIR001"}
    assert len(s["pending_operations"]) == 4
    assert s["recent_moves"][0]["quantity"] == 3

    # Filtered by type
    f = (await client.get("/api/v1/dashboard/summary", headers=h, params={"type": "delivery"})).json()
    assert all(op["type"] == "delivery" for op in f["pending_operations"])
    assert f["status_counts"]["ready"] + f["status_counts"]["waiting"] == 2


async def test_stock_flow_counts_units_in_and_out_per_day(client, manager, world) -> None:
    h = manager["headers"]
    await receive(client, h, world["loc_a"]["id"], world["desk"]["id"], 7)
    for payload in (
        {"type": "delivery", "source_location_id": world["loc_a"]["id"]},
        {"type": "transfer", "source_location_id": world["loc_a"]["id"],
         "destination_location_id": world["loc_b"]["id"]},
    ):
        qty = 2 if payload["type"] == "delivery" else 1
        op = await create_op(client, h, lines=[{"product_id": world["desk"]["id"], "quantity": qty}], **payload)
        assert (await client.post(f"{API}/{op['id']}/validate", headers=h)).status_code == 200

    s = (await client.get("/api/v1/dashboard/summary", headers=h)).json()
    flow = s["stock_flow"]
    assert len(flow) == 14 and flow[0]["day"] < flow[-1]["day"]
    assert sum(d["inbound"] for d in flow[:-1]) == 0
    # Transfers only move stock around, so the whole-workspace view leaves them out.
    assert flow[-1]["inbound"] == 7 and flow[-1]["outbound"] == 2

    # Scoped to the destination location, the transfer is an arrival.
    b = (await client.get("/api/v1/dashboard/summary", headers=h,
                          params={"location_id": world["loc_b"]["id"]})).json()
    assert b["stock_flow"][-1]["inbound"] == 1 and b["stock_flow"][-1]["outbound"] == 0


async def test_summary_cache_invalidated_by_validation(client, manager, world) -> None:
    h = manager["headers"]
    first = (await client.get("/api/v1/dashboard/summary", headers=h)).json()
    assert first["total_units"] == 0
    await receive(client, h, world["loc_a"]["id"], world["desk"]["id"], 7)
    second = (await client.get("/api/v1/dashboard/summary", headers=h)).json()
    assert second["total_units"] == 7


async def test_health(client) -> None:
    r = await client.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"
    assert (await client.get("/health/live")).status_code == 200
    assert r.headers["x-frame-options"] == "DENY" and r.headers["x-content-type-options"] == "nosniff"
