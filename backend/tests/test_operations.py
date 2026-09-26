from __future__ import annotations

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

pytestmark = pytest.mark.asyncio

API = "/api/v1/operations"


async def create_op(client: httpx.AsyncClient, headers: dict, **payload) -> dict:
    r = await client.post(API, headers=headers, json=payload)
    assert r.status_code == 201, r.text
    return r.json()


async def receive(client: httpx.AsyncClient, headers: dict, location_id: str, product_id: str, qty: float) -> dict:
    op = await create_op(client, headers, type="receipt", supplier_or_customer="Acme Steel",
                         destination_location_id=location_id, lines=[{"product_id": product_id, "quantity": qty}])
    r = await client.post(f"{API}/{op['id']}/validate", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


async def on_hand(client: httpx.AsyncClient, headers: dict, product_id: str, location_id: str | None = None) -> float:
    p = (await client.get(f"/api/v1/products/{product_id}", headers=headers)).json()
    if location_id is None:
        return p["total_on_hand"]
    return next((s["quantity"] for s in p["stock_by_location"] if s["location"]["id"] == location_id), 0.0)


async def test_receipt_reference_and_validation_increments_stock(client, manager, world, mailbox) -> None:
    h = manager["headers"]
    op = await create_op(client, h, type="receipt", supplier_or_customer="Acme",
                         destination_location_id=world["loc_a"]["id"], scheduled_date="2026-10-01",
                         lines=[{"product_id": world["desk"]["id"], "quantity": 50}])
    assert op["reference"].startswith("WH/IN/") and op["reference"].endswith("/0001")
    assert op["status"] == "ready"

    r = await client.post(f"{API}/{op['id']}/validate", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["operation"]["status"] == "done"
    assert body["operation"]["validated_by"]["id"] == manager["user"]["id"]
    assert len(body["ledger_entries"]) == 1 and body["ledger_entries"][0]["quantity"] == 50
    assert await on_hand(client, h, world["desk"]["id"], world["loc_a"]["id"]) == 50


async def test_double_validation_returns_409(client, manager, world) -> None:
    h = manager["headers"]
    op = await create_op(client, h, type="receipt", destination_location_id=world["loc_a"]["id"],
                         lines=[{"product_id": world["desk"]["id"], "quantity": 3}])
    assert (await client.post(f"{API}/{op['id']}/validate", headers=h)).status_code == 200
    again = await client.post(f"{API}/{op['id']}/validate", headers=h)
    assert again.status_code == 409 and again.json()["code"] == "ALREADY_VALIDATED"
    assert await on_hand(client, h, world["desk"]["id"]) == 3


async def test_validation_requires_lines(client, manager, world) -> None:
    h = manager["headers"]
    op = await create_op(client, h, type="receipt", destination_location_id=world["loc_a"]["id"])
    assert op["status"] == "draft"
    r = await client.post(f"{API}/{op['id']}/validate", headers=h)
    assert r.status_code == 400 and r.json()["code"] == "NO_LINES"


async def test_delivery_insufficient_stock_is_422_and_rolls_back(client, manager, world) -> None:
    h = manager["headers"]
    await receive(client, h, world["loc_a"]["id"], world["desk"]["id"], 4)
    await receive(client, h, world["loc_a"]["id"], world["chair"]["id"], 10)
    op = await create_op(client, h, type="delivery", supplier_or_customer="Azure Interior",
                         source_location_id=world["loc_a"]["id"],
                         lines=[{"product_id": world["chair"]["id"], "quantity": 2},
                                {"product_id": world["desk"]["id"], "quantity": 6}])
    assert op["status"] == "waiting"
    desk_line = next(ln for ln in op["lines"] if ln["product"]["id"] == world["desk"]["id"])
    assert desk_line["is_short"] is True and desk_line["available"] == 4

    r = await client.post(f"{API}/{op['id']}/validate", headers=h)
    assert r.status_code == 422
    body = r.json()
    assert body["code"] == "INSUFFICIENT_STOCK"
    assert body["field"] == "lines[1].quantity"
    assert body["shortages"][0]["available"] == 4 and body["shortages"][0]["requested"] == 6
    # nothing moved — including the chair line that alone would have succeeded
    assert await on_hand(client, h, world["chair"]["id"]) == 10
    assert await on_hand(client, h, world["desk"]["id"]) == 4
    detail = (await client.get(f"{API}/{op['id']}", headers=h)).json()
    assert detail["status"] == "waiting"


async def test_delivery_decrements_stock(client, manager, world) -> None:
    h = manager["headers"]
    await receive(client, h, world["loc_a"]["id"], world["desk"]["id"], 10)
    op = await create_op(client, h, type="delivery", supplier_or_customer="Azure Interior",
                         source_location_id=world["loc_a"]["id"],
                         lines=[{"product_id": world["desk"]["id"], "quantity": 6}])
    assert op["status"] == "ready" and op["reference"].startswith("WH/OUT/")
    r = await client.post(f"{API}/{op['id']}/validate", headers=h)
    assert r.status_code == 200
    assert r.json()["ledger_entries"][0]["quantity"] == -6
    assert await on_hand(client, h, world["desk"]["id"]) == 4


async def test_waiting_delivery_becomes_ready_after_receipt(client, manager, world) -> None:
    h = manager["headers"]
    op = await create_op(client, h, type="delivery", source_location_id=world["loc_a"]["id"],
                         lines=[{"product_id": world["desk"]["id"], "quantity": 5}])
    assert op["status"] == "waiting"
    await receive(client, h, world["loc_a"]["id"], world["desk"]["id"], 5)
    assert (await client.get(f"{API}/{op['id']}", headers=h)).json()["status"] == "ready"


async def test_transfer_moves_stock_with_two_ledger_entries(client, manager, world) -> None:
    h = manager["headers"]
    await receive(client, h, world["loc_a"]["id"], world["desk"]["id"], 100)
    op = await create_op(client, h, type="transfer", source_location_id=world["loc_a"]["id"],
                         destination_location_id=world["loc_b"]["id"],
                         lines=[{"product_id": world["desk"]["id"], "quantity": 30}])
    assert op["reference"].startswith("WH/INT/")
    r = await client.post(f"{API}/{op['id']}/validate", headers=h)
    assert r.status_code == 200
    entries = r.json()["ledger_entries"]
    assert sorted(e["quantity"] for e in entries) == [-30, 30]
    assert await on_hand(client, h, world["desk"]["id"], world["loc_a"]["id"]) == 70
    assert await on_hand(client, h, world["desk"]["id"], world["loc_b"]["id"]) == 30
    assert await on_hand(client, h, world["desk"]["id"]) == 100


async def test_transfer_same_location_rejected(client, manager, world) -> None:
    r = await client.post(API, headers=manager["headers"], json={
        "type": "transfer", "source_location_id": world["loc_a"]["id"],
        "destination_location_id": world["loc_a"]["id"], "lines": []})
    assert r.status_code == 422 and r.json()["code"] == "SAME_LOCATION"


async def test_adjustment_records_signed_delta(client, manager, world) -> None:
    h = manager["headers"]
    await receive(client, h, world["loc_a"]["id"], world["desk"]["id"], 100)
    op = await create_op(client, h, type="adjustment", destination_location_id=world["loc_a"]["id"],
                         lines=[{"product_id": world["desk"]["id"], "quantity": 97}])
    assert op["lines"][0]["delta"] == -3 and op["lines"][0]["available"] == 100
    r = await client.post(f"{API}/{op['id']}/validate", headers=h)
    assert r.status_code == 200
    assert [e["quantity"] for e in r.json()["ledger_entries"]] == [-3]
    assert r.json()["operation"]["lines"][0]["delta"] == -3
    assert await on_hand(client, h, world["desk"]["id"]) == 97

    up = await create_op(client, h, type="adjustment", destination_location_id=world["loc_a"]["id"],
                         lines=[{"product_id": world["desk"]["id"], "quantity": 110}])
    r2 = await client.post(f"{API}/{up['id']}/validate", headers=h)
    assert [e["quantity"] for e in r2.json()["ledger_entries"]] == [13]
    assert await on_hand(client, h, world["desk"]["id"]) == 110


async def test_staff_cannot_validate_adjustment(client, manager, staff, world) -> None:
    op = await create_op(client, staff["headers"], type="adjustment", destination_location_id=world["loc_a"]["id"],
                         lines=[{"product_id": world["desk"]["id"], "quantity": 1}])
    r = await client.post(f"{API}/{op['id']}/validate", headers=staff["headers"])
    assert r.status_code == 403 and r.json()["code"] == "MANAGER_REQUIRED"
    assert await on_hand(client, manager["headers"], world["desk"]["id"]) == 0


async def test_staff_can_validate_receipt_but_cannot_cancel(client, manager, staff, world) -> None:
    op = await create_op(client, staff["headers"], type="receipt", destination_location_id=world["loc_a"]["id"],
                         lines=[{"product_id": world["desk"]["id"], "quantity": 2}])
    cancel = await client.post(f"{API}/{op['id']}/cancel", headers=staff["headers"])
    assert cancel.status_code == 403
    ok = await client.post(f"{API}/{op['id']}/validate", headers=staff["headers"])
    assert ok.status_code == 200


async def test_cancel_rules(client, manager, world) -> None:
    h = manager["headers"]
    op = await create_op(client, h, type="receipt", destination_location_id=world["loc_a"]["id"],
                         lines=[{"product_id": world["desk"]["id"], "quantity": 2}])
    r = await client.post(f"{API}/{op['id']}/cancel", headers=h)
    assert r.status_code == 200 and r.json()["status"] == "canceled"
    assert (await client.post(f"{API}/{op['id']}/validate", headers=h)).status_code == 409
    assert (await client.post(f"{API}/{op['id']}/cancel", headers=h)).json()["code"] == "ALREADY_CANCELED"
    edit = await client.put(f"{API}/{op['id']}", headers=h, json={"notes": "late"})
    assert edit.status_code == 409 and edit.json()["code"] == "OPERATION_LOCKED"

    done = await receive(client, h, world["loc_a"]["id"], world["desk"]["id"], 1)
    r = await client.post(f"{API}/{done['operation']['id']}/cancel", headers=h)
    assert r.status_code == 409 and r.json()["code"] == "ALREADY_VALIDATED"


async def test_update_draft_replaces_lines(client, manager, world) -> None:
    h = manager["headers"]
    op = await create_op(client, h, type="receipt", destination_location_id=world["loc_a"]["id"],
                         lines=[{"product_id": world["desk"]["id"], "quantity": 2}])
    r = await client.put(f"{API}/{op['id']}", headers=h, json={
        "supplier_or_customer": "Vendor B",
        "lines": [{"product_id": world["desk"]["id"], "quantity": 5}, {"product_id": world["chair"]["id"], "quantity": 1}],
    })
    assert r.status_code == 200
    body = r.json()
    assert body["supplier_or_customer"] == "Vendor B" and body["line_count"] == 2
    dup = await client.put(f"{API}/{op['id']}", headers=h, json={
        "lines": [{"product_id": world["desk"]["id"], "quantity": 1}, {"product_id": world["desk"]["id"], "quantity": 2}]})
    assert dup.status_code == 422 and dup.json()["field"] == "lines[1].product_id"


async def test_list_filters(client, manager, world) -> None:
    h = manager["headers"]
    await create_op(client, h, type="receipt", supplier_or_customer="Acme", destination_location_id=world["loc_a"]["id"],
                    lines=[{"product_id": world["desk"]["id"], "quantity": 1}])
    await create_op(client, h, type="delivery", supplier_or_customer="Azure", source_location_id=world["loc_a"]["id"],
                    lines=[{"product_id": world["desk"]["id"], "quantity": 1}])
    receipts = (await client.get(API, headers=h, params={"type": "receipt"})).json()
    assert receipts["total"] == 1 and receipts["items"][0]["type"] == "receipt"
    waiting = (await client.get(API, headers=h, params={"status": "waiting"})).json()
    assert waiting["total"] == 1 and waiting["items"][0]["type"] == "delivery"
    search = (await client.get(API, headers=h, params={"q": "azure"})).json()
    assert search["total"] == 1
    by_wh = (await client.get(API, headers=h, params={"warehouse_id": world["warehouse"]["id"], "status": "open"})).json()
    assert by_wh["total"] == 2
    bad = await client.get(API, headers=h, params={"status": "bogus"})
    assert bad.status_code == 422


async def test_ledger_is_append_only_at_db_level(client, manager, world, db_session) -> None:
    await receive(client, manager["headers"], world["loc_a"]["id"], world["desk"]["id"], 1)
    with pytest.raises(DBAPIError):
        async with db_session.begin_nested():
            await db_session.execute(text("UPDATE ledger_entries SET quantity = 999"))


async def test_low_stock_alert_email_after_delivery(client, manager, world, mailbox) -> None:
    h = manager["headers"]  # desk reorder point = 5
    await receive(client, h, world["loc_a"]["id"], world["desk"]["id"], 8)
    mailbox.sent.clear()
    op = await create_op(client, h, type="delivery", source_location_id=world["loc_a"]["id"],
                         lines=[{"product_id": world["desk"]["id"], "quantity": 4}])
    assert (await client.post(f"{API}/{op['id']}/validate", headers=h)).status_code == 200
    assert any("Low stock" in m.subject and m.to == "manager@stocksense.dev" for m in mailbox.sent)
