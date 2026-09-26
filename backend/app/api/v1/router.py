from fastapi import APIRouter

from app.api.v1 import auth, categories, dashboard, ledger, locations, operations, products, users, warehouses

api_router = APIRouter(prefix="/api/v1")
for module in (auth, dashboard, products, categories, warehouses, locations, operations, ledger, users):
    api_router.include_router(module.router)
