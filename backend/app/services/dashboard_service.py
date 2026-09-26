"""Dashboard KPI aggregation with a short-lived (2 min) Redis cache, invalidated on every mutation."""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone

from app.core import cache as cache_keys
from app.core.cache import Cache, cache as default_cache
from app.core.security import utcnow
from app.db.models import OPEN_STATUSES, OperationStatus, OperationType
from app.repositories.operation_repo import OperationFilters
from app.repositories.unit_of_work import UnitOfWork
from app.schemas.dashboard import DashboardSummary, FlowDay, LowStockItem, StatusCounts, TypeBreakdown

FLOW_DAYS = 14
from app.services.mappers import ledger_out, operation_summary


@dataclass(slots=True)
class DashboardFilters:
    type: OperationType | None = None
    status: OperationStatus | None = None
    warehouse_id: uuid.UUID | None = None
    location_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None

    def cache_key(self) -> str:
        raw = json.dumps(
            {
                "type": self.type.value if self.type else None,
                "status": self.status.value if self.status else None,
                "warehouse_id": str(self.warehouse_id) if self.warehouse_id else None,
                "location_id": str(self.location_id) if self.location_id else None,
                "category_id": str(self.category_id) if self.category_id else None,
            },
            sort_keys=True,
        )
        return f"{cache_keys.DASHBOARD_PREFIX}:{hashlib.sha1(raw.encode()).hexdigest()[:16]}"


class DashboardService:
    def __init__(self, uow: UnitOfWork, cache: Cache = default_cache) -> None:
        self.uow = uow
        self.cache = cache

    async def summary(self, f: DashboardFilters) -> DashboardSummary:
        key = f.cache_key()
        cached = await self.cache.get_json(key)
        if cached is not None:
            return DashboardSummary.model_validate(cached)
        result = await self._compute(f)
        await self.cache.set_json(key, result.model_dump(mode="json"), cache_keys.TTL_DASHBOARD)
        return result

    async def _compute(self, f: DashboardFilters) -> DashboardSummary:
        today = utcnow().date()

        location_ids: list[uuid.UUID] | None = None
        if f.location_id is not None:
            location_ids = [f.location_id]
        elif f.warehouse_id is not None:
            location_ids = [loc.id for loc in await self.uow.locations.list_filtered(f.warehouse_id)]

        health = await self.uow.products.stock_health_counts(f.category_id, location_ids)
        scope = OperationFilters(warehouse_id=f.warehouse_id, location_id=f.location_id, category_id=f.category_id)
        breakdown = await self.uow.operations.open_breakdown(scope, today)

        typed_scope = OperationFilters(type=f.type, warehouse_id=f.warehouse_id, location_id=f.location_id,
                                       category_id=f.category_id)
        counts = await self.uow.operations.status_counts(typed_scope)

        list_scope = OperationFilters(
            type=f.type, statuses=[f.status] if f.status else list(OPEN_STATUSES),
            warehouse_id=f.warehouse_id, location_id=f.location_id, category_id=f.category_id,
        )
        pending = await self.uow.operations.list_open(list_scope, limit=8)
        stats = await self.uow.operations.line_stats([p.id for p in pending])

        attention = await self.uow.products.attention_items(category_id=f.category_id, limit=6,
                                                            location_ids=location_ids)
        moves = await self.uow.ledger.recent(limit=8, location_ids=location_ids)

        first_day = today - timedelta(days=FLOW_DAYS - 1)
        flow_rows = await self.uow.ledger.daily_flow(datetime.combine(first_day, time.min, tzinfo=timezone.utc),
                                                     location_ids)
        by_day = {d: (i, o) for d, i, o in flow_rows}
        stock_flow = []
        for n in range(FLOW_DAYS):
            d = first_day + timedelta(days=n)
            inbound, outbound = by_day.get(d, (0.0, 0.0))
            stock_flow.append(FlowDay(day=d, inbound=inbound, outbound=outbound))

        def tb(t: OperationType) -> TypeBreakdown:
            return TypeBreakdown(**breakdown.get(t.value, {}))

        receipts, deliveries = tb(OperationType.receipt), tb(OperationType.delivery)
        transfers, adjustments = tb(OperationType.transfer), tb(OperationType.adjustment)
        return DashboardSummary(
            total_products=int(health["total"]),
            products_in_stock=int(health["in_stock"]),
            total_units=float(health["units"]),
            low_stock_count=int(health["low"]),
            out_of_stock_count=int(health["out"]),
            pending_receipts=receipts.open,
            pending_deliveries=deliveries.open,
            scheduled_transfers=transfers.open,
            pending_adjustments=adjustments.open,
            receipts=receipts, deliveries=deliveries, transfers=transfers, adjustments=adjustments,
            status_counts=StatusCounts(**counts),
            low_stock_items=[
                LowStockItem(
                    id=r.product.id, name=r.product.name, sku=r.product.sku,
                    unit_of_measure=r.product.unit_of_measure, total_on_hand=float(r.on_hand),
                    reorder_point=float(r.reorder_point) if r.reorder_point is not None else None,
                    is_out_of_stock=r.on_hand <= 0,
                )
                for r in attention
            ],
            pending_operations=[operation_summary(p, stats.get(p.id, (0, 0.0)), today) for p in pending],
            recent_moves=[ledger_out(e) for e in moves],
            stock_flow=stock_flow,
            generated_at=utcnow(),
        )
