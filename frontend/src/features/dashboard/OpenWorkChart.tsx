import { motion, useReducedMotion } from 'framer-motion'
import { Clock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardHeader } from '@/components/ui/Card'
import { Tooltip } from '@/components/ui/Tooltip'
import { OPERATION_TYPES, operationPath } from '@/features/operations/config'
import { cn, formatQty } from '@/lib/utils'
import type { DashboardSummary, OperationType, TypeBreakdown } from '@/types/api'

const STAGES = [
  { key: 'draft', label: 'Draft', bar: 'bg-viz-neutral' },
  { key: 'waiting', label: 'Waiting', bar: 'bg-viz-warn' },
  { key: 'ready', label: 'Ready', bar: 'bg-viz-ready' },
] as const

const ROWS: { type: OperationType; field: 'receipts' | 'deliveries' | 'transfers' | 'adjustments' }[] = [
  { type: 'receipt', field: 'receipts' },
  { type: 'delivery', field: 'deliveries' },
  { type: 'transfer', field: 'transfers' },
  { type: 'adjustment', field: 'adjustments' },
]

/**
 * Open work per document type, split by stage (draft → waiting → ready) on one shared scale,
 * so the busiest pipeline and anything stuck waiting stand out. Late counts are called out.
 */
export function OpenWorkChart({ data, hrefFor }: { data: DashboardSummary; hrefFor?: (t: OperationType, status: string) => string }) {
  const reduce = useReducedMotion()
  const href = hrefFor ?? ((t: OperationType, status: string) => `${operationPath(t)}?status=${status}`)
  const max = Math.max(1, ...ROWS.map((r) => data[r.field].open))
  const totalOpen = ROWS.reduce((s, r) => s + data[r.field].open, 0)

  return (
    <Card>
      <CardHeader
        title="Open work"
        description={totalOpen ? `${formatQty(totalOpen)} documents in progress` : 'Nothing in progress'}
        action={
          <ul className="flex items-center gap-3 text-xs text-muted" aria-label="Legend">
            {STAGES.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span className={cn('h-2.5 w-2.5 rounded-sm', s.bar)} aria-hidden />
                {s.label}
              </li>
            ))}
          </ul>
        }
      />
      <ul className="space-y-3 px-5 pb-5 pt-4">
        {ROWS.map((row, r) => {
          const b: TypeBreakdown = data[row.field]
          const cfg = OPERATION_TYPES[row.type]
          const Icon = cfg.icon
          const parts = STAGES.filter((s) => b[s.key] > 0)
          return (
            <li key={row.type} className="grid grid-cols-[112px_1fr_auto] items-center gap-3 sm:grid-cols-[132px_1fr_auto]">
              <Link
                to={href(row.type, 'open')}
                className="focus-ring group flex min-w-0 items-center gap-2 rounded text-[13px] font-medium text-fg"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent transition-transform duration-200 group-hover:scale-110">
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span className="truncate group-hover:text-accent">{cfg.plural}</span>
              </Link>

              <div className="flex h-5 items-center" role="img" aria-label={`${cfg.plural}: ${b.draft} draft, ${b.waiting} waiting, ${b.ready} ready`}>
                {b.open === 0 ? (
                  <span className="h-px w-full bg-border" aria-hidden />
                ) : (
                  <motion.div
                    className="flex h-full gap-[2px]"
                    initial={reduce ? false : { width: 0 }}
                    animate={{ width: `${(b.open / max) * 100}%` }}
                    transition={{ duration: 0.6, delay: 0.08 * r, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {parts.map((s, i) => (
                      <Tooltip key={s.key} content={`${formatQty(b[s.key])} ${s.label.toLowerCase()}`}>
                        <Link
                          to={href(row.type, s.key)}
                          aria-label={`${formatQty(b[s.key])} ${s.label.toLowerCase()} ${cfg.plural.toLowerCase()}`}
                          className={cn(
                            'focus-ring h-full min-w-[4px] transition-[filter] duration-150 hover:brightness-110',
                            s.bar,
                            i === parts.length - 1 && 'rounded-r-[4px]',
                          )}
                          style={{ flexGrow: b[s.key], flexBasis: 0 }}
                        />
                      </Tooltip>
                    ))}
                  </motion.div>
                )}
              </div>

              <div className="flex min-w-[76px] items-center justify-end gap-2 text-right">
                {b.late > 0 && (
                  <Link
                    to={href(row.type, 'open')}
                    className="focus-ring inline-flex items-center gap-1 rounded-full bg-danger-soft px-1.5 py-0.5 text-[11px] font-medium text-danger"
                  >
                    <Clock className="h-3 w-3" aria-hidden />
                    {formatQty(b.late)} late
                  </Link>
                )}
                <span className="tabular text-[13px] font-semibold text-fg">{formatQty(b.open)}</span>
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
