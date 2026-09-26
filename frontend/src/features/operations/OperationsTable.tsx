import { ArrowRight } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { StatusBadge } from '@/components/StatusBadge'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table'
import { cn, formatDate, formatQty } from '@/lib/utils'
import type { LocationRef, OperationSummary } from '@/types/api'
import { OPERATION_TYPES, operationPath } from './config'

function Loc({ loc, fallback }: { loc: LocationRef | null; fallback?: string | null }) {
  if (loc) return <span className="font-mono text-xs text-fg">{loc.full_code}</span>
  return <span className="text-xs text-muted">{fallback || '—'}</span>
}

export function Route({ op }: { op: OperationSummary }) {
  const from = op.type === 'receipt' ? <Loc loc={null} fallback={op.supplier_or_customer ?? 'Vendor'} /> : <Loc loc={op.source_location} />
  const to =
    op.type === 'delivery' ? (
      <Loc loc={null} fallback={op.supplier_or_customer ?? 'Customer'} />
    ) : (
      <Loc loc={op.destination_location} />
    )
  if (op.type === 'adjustment') return <Loc loc={op.destination_location} />
  return (
    <span className="inline-flex items-center gap-1.5">
      {from}
      <ArrowRight className="h-3 w-3 text-subtle" aria-label="to" />
      {to}
    </span>
  )
}

export function ScheduledDate({ op }: { op: OperationSummary }) {
  if (!op.scheduled_date) return <span className="text-muted">—</span>
  return (
    <span className={cn('tabular', op.is_late ? 'font-medium text-emphasis' : 'text-fg')}>
      {formatDate(op.scheduled_date, { short: true })}
      {op.is_late && <span className="ml-1.5 text-xs font-normal">Late</span>}
    </span>
  )
}

export function OperationsTable({ items, showType = false }: { items: OperationSummary[]; showType?: boolean }) {
  const navigate = useNavigate()
  return (
    <Table>
      <THead>
        <tr>
          <TH>Reference</TH>
          {showType && <TH className="hidden md:table-cell">Type</TH>}
          <TH className="hidden sm:table-cell">Route</TH>
          <TH className="hidden lg:table-cell">Contact</TH>
          <TH className="hidden md:table-cell">Scheduled</TH>
          <TH className="hidden xl:table-cell text-right">Qty</TH>
          <TH className="text-right">Status</TH>
        </tr>
      </THead>
      <TBody>
        {items.map((op) => {
          const cfg = OPERATION_TYPES[op.type]
          const Icon = cfg.icon
          return (
            <TR key={op.id} onActivate={() => navigate(operationPath(op.type, op.id))}>
              <TD>
                <Link to={operationPath(op.type, op.id)} className="focus-ring rounded font-mono text-[13px] font-medium text-fg hover:text-accent">
                  {op.reference}
                </Link>
                <div className="mt-0.5 text-xs text-muted sm:hidden">
                  <Route op={op} />
                </div>
              </TD>
              {showType && (
                <TD className="hidden md:table-cell">
                  <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {cfg.label}
                  </span>
                </TD>
              )}
              <TD className="hidden sm:table-cell">
                <Route op={op} />
              </TD>
              <TD className="hidden max-w-[200px] truncate text-muted lg:table-cell">{op.supplier_or_customer ?? '—'}</TD>
              <TD className="hidden md:table-cell">
                <ScheduledDate op={op} />
              </TD>
              <TD className="tabular hidden text-right text-muted xl:table-cell">{formatQty(op.total_quantity)}</TD>
              <TD className="text-right">
                <StatusBadge status={op.status} />
              </TD>
            </TR>
          )
        })}
      </TBody>
    </Table>
  )
}
