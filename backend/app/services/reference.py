"""Reference number generation, e.g. WH/IN/2026/0001 (sequence per type and year)."""

from __future__ import annotations

from app.db.models import OperationType
from app.repositories.unit_of_work import UnitOfWork

TYPE_CODES = {
    OperationType.receipt: "IN",
    OperationType.delivery: "OUT",
    OperationType.transfer: "INT",
    OperationType.adjustment: "ADJ",
}


async def next_reference(uow: UnitOfWork, op_type: OperationType, warehouse_code: str, year: int) -> str:
    # Serialise numbering for this (type, year) until the surrounding transaction ends.
    await uow.operations.reserve_reference_sequence(op_type, year)
    seq = await uow.operations.count_by_type_and_year(op_type, year) + 1
    while True:
        reference = f"{warehouse_code}/{TYPE_CODES[op_type]}/{year}/{seq:04d}"
        if not await uow.operations.reference_exists(reference):
            return reference
        seq += 1
