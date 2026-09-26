import { Link } from 'react-router-dom'
import { QtyChange } from '@/components/QtyChange'
import { operationPath } from '@/features/operations/config'
import { relativeTime } from '@/lib/utils'
import type { LedgerEntry } from '@/types/api'

export function moveRoute(e: LedgerEntry): string {
  const from = e.from_location?.full_code ?? (e.type === 'receipt' ? e.operation.supplier_or_customer ?? 'Vendor' : null)
  const to = e.to_location?.full_code ?? (e.type === 'delivery' ? e.operation.supplier_or_customer ?? 'Customer' : null)
  if (e.type === 'adjustment') return `${(e.to_location ?? e.from_location)?.full_code ?? ''} · count`
  return `${from ?? '—'} → ${to ?? '—'}`
}

/** Compact recent-movement feed for dashboard/product pages. */
export function MovesList({ items }: { items: LedgerEntry[] }) {
  return (
    <ul className="divide-y divide-border">
      {items.map((e) => (
        <li key={e.id} className="flex items-center gap-3 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] text-fg">
              <Link to={`/products/${e.product.id}`} className="focus-ring rounded font-medium hover:text-accent">
                {e.product.name}
              </Link>
            </div>
            <div className="truncate text-xs text-muted">
              <Link to={operationPath(e.type, e.operation.id)} className="focus-ring rounded font-mono hover:text-accent">
                {e.operation.reference}
              </Link>{' '}
              · {moveRoute(e)}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <QtyChange value={e.quantity} className="text-[13px]" />
            <div className="text-xs text-subtle">{relativeTime(e.performed_at)}</div>
          </div>
        </li>
      ))}
    </ul>
  )
}
