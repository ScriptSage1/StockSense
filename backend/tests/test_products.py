from __future__ import annotations

import httpx
import pytest

pytestmark = pytest.mark.asyncio


async def test_product_crud_and_search(client: httpx.AsyncClient, manager: dict, world: dict) -> None:
    h = manager["headers"]
    r = await client.get("/api/v1/products", headers=h, params={"q": "desk"})
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1 and body["items"][0]["sku"] == "DESK001"
    assert body["items"][0]["total_on_hand"] == 0 and body["items"][0]["is_out_of_stock"] is True

    by_sku = await client.get("/api/v1/products", headers=h, params={"q": "chair0"})
    assert by_sku.json()["items"][0]["name"] == "Chair"

    by_cat = await client.get("/api/v1/products", headers=h, params={"category_id": world["category"]["id"]})
    assert by_cat.json()["total"] == 2

    pid = world["desk"]["id"]
    upd = await client.put(f"/api/v1/products/{pid}", headers=h, json={"name": "Standing Desk", "reorder_point": 2})
    assert upd.status_code == 200
    assert upd.json()["name"] == "Standing Desk" and upd.json()["reorder_point"] == 2

    detail = await client.get(f"/api/v1/products/{pid}", headers=h)
    assert detail.status_code == 200 and detail.json()["stock_by_location"] == []

    missing = await client.get("/api/v1/products/00000000-0000-0000-0000-000000000000", headers=h)
    assert missing.status_code == 404 and missing.json()["code"] == "NOT_FOUND"


async def test_duplicate_sku_conflict(client: httpx.AsyncClient, manager: dict, world: dict) -> None:
    r = await client.post("/api/v1/products", headers=manager["headers"],
                          json={"name": "Another desk", "sku": "desk001", "unit_of_measure": "unit"})
    assert r.status_code == 409
    assert r.json()["code"] == "DUPLICATE_SKU" and r.json()["field"] == "sku"

    upd = await client.put(f"/api/v1/products/{world['chair']['id']}", headers=manager["headers"],
                           json={"sku": "DESK001"})
    assert upd.status_code == 409 and upd.json()["code"] == "DUPLICATE_SKU"


async def test_initial_stock_creates_stock_and_ledger(client: httpx.AsyncClient, manager: dict, world: dict) -> None:
    h = manager["headers"]
    r = await client.post("/api/v1/products", headers=h, json={
        "name": "Steel Rod", "sku": "ROD-10", "unit_of_measure": "kg",
        "initial_stock": {"location_id": world["loc_a"]["id"], "quantity": 100},
    })
    assert r.status_code == 201, r.text
    p = r.json()
    assert p["total_on_hand"] == 100
    assert p["stock_by_location"][0]["quantity"] == 100
    ledger = (await client.get("/api/v1/ledger", headers=h, params={"product_id": p["id"]})).json()
    assert ledger["total"] == 1
    entry = ledger["items"][0]
    assert entry["quantity"] == 100 and entry["type"] == "adjustment" and entry["direction"] == "in"
    assert entry["operation"]["reference"].startswith("WH/ADJ/")


async def test_staff_can_create_but_not_delete(client: httpx.AsyncClient, manager: dict, staff: dict,
                                               world: dict) -> None:
    created = await client.post("/api/v1/products", headers=staff["headers"],
                                json={"name": "Lamp", "sku": "LAMP1", "unit_of_measure": "unit"})
    assert created.status_code == 201
    denied = await client.delete(f"/api/v1/products/{created.json()['id']}", headers=staff["headers"])
    assert denied.status_code == 403
    ok = await client.delete(f"/api/v1/products/{created.json()['id']}", headers=manager["headers"])
    assert ok.status_code == 204
    listing = await client.get("/api/v1/products", headers=manager["headers"], params={"q": "LAMP1"})
    assert listing.json()["total"] == 0


async def test_cannot_delete_product_with_stock(client: httpx.AsyncClient, manager: dict, world: dict) -> None:
    r = await client.post("/api/v1/products", headers=manager["headers"], json={
        "name": "Bolt", "sku": "BOLT", "unit_of_measure": "unit",
        "initial_stock": {"location_id": world["loc_a"]["id"], "quantity": 5},
    })
    d = await client.delete(f"/api/v1/products/{r.json()['id']}", headers=manager["headers"])
    assert d.status_code == 400 and d.json()["code"] == "PRODUCT_HAS_STOCK"


async def test_warehouse_and_location_rbac(client: httpx.AsyncClient, manager: dict, staff: dict,
                                           world: dict) -> None:
    denied = await client.post("/api/v1/warehouses", headers=staff["headers"], json={"name": "Second", "short_code": "W2"})
    assert denied.status_code == 403
    dup = await client.post("/api/v1/warehouses", headers=manager["headers"], json={"name": "Dup", "short_code": "wh"})
    assert dup.status_code == 409
    locs = await client.get("/api/v1/locations", headers=staff["headers"],
                            params={"warehouse_id": world["warehouse"]["id"]})
    assert locs.status_code == 200 and {loc["short_code"] for loc in locs.json()} == {"STOCK", "PROD"}
    assert locs.json()[0]["full_code"].startswith("WH/")
    upd = await client.put(f"/api/v1/locations/{world['loc_b']['id']}", headers=staff["headers"], json={"name": "X"})
    assert upd.status_code == 403
