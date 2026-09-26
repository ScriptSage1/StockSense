import { motion, useReducedMotion } from 'framer-motion'
import {
  AlertOctagon,
  CheckCircle2,
  ChevronRight,
  Clock,
  PackageX,
  ShieldCheck,
  TrendingDown,
  Truck,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { Card } from '@/components/ui/Card'
import { operationPath } from '@/features/operations/config'
import { cn, formatQty, pluralize } from '@/lib/utils'
import type { DashboardSummary } from '@/types/api'

type Tone = 'bad' | 'warn' | 'info'

interface Callout {
  key: string
  icon: LucideIcon
  tone: Tone
  text: string
  to: string
}

const TONE: Record<Tone, string> = {
  bad: 'bg-danger-soft text-danger',
  warn: 'bg-warning-soft text-warning',
  info: 'bg-info-soft text-info',
}

/** The few things worth acting on right now, most urgent first. */
function callouts(d: DashboardSummary): Callout[] {
  const late = d.receipts.late + d.deliveries.late + d.transfers.late + d.adjustments.late
  const ready = d.receipts.ready + d.deliveries.ready + d.transfers.ready + d.adjustments.ready
  const list: Callout[] = []
  if (d.out_of_stock_count)
    list.push({ key: 'out', icon: PackageX, tone: 'bad', to: '/products?stock=out',
      text: `${pluralize(d.out_of_stock_count, 'product')} out of stock` })
  if (late)
    list.push({ key: 'late', icon: Clock, tone: 'bad', to: `${operationPath(d.deliveries.late ? 'delivery' : 'receipt')}?status=open`,
      text: `${pluralize(late, 'operation')} past schedule` })
  if (d.low_stock_count)
    list.push({ key: 'low', icon: TrendingDown, tone: 'warn', to: '/products?stock=low',
      text: `${formatQty(d.low_stock_count)} running low` })
  if (d.deliveries.waiting)
    list.push({ key: 'waiting', icon: Truck, tone: 'warn', to: `${operationPath('delivery')}?status=waiting`,
      text: `${pluralize(d.deliveries.waiting, 'delivery', 'deliveries')} waiting on stock` })
  if (ready)
    list.push({ key: 'ready', icon: CheckCircle2, tone: 'info', to: `${operationPath(d.receipts.ready ? 'receipt' : 'delivery')}?status=ready`,
      text: `${formatQty(ready)} ready to validate` })
  return list
}

const SEGMENTS = [
  { key: 'healthy', label: 'Healthy', icon: ShieldCheck, bar: 'bg-viz-good', to: '/products?stock=in_stock' },
  { key: 'low', label: 'Low', icon: TrendingDown, bar: 'bg-viz-warn', to: '/products?stock=low' },
  { key: 'out', label: 'Out', icon: AlertOctagon, bar: 'bg-viz-bad', to: '/products?stock=out' },
] as const

/**
 * "At a glance": what share of the catalogue is healthy, the split into healthy / low / out,
 * and a short list of what needs doing. Status colours always come with an icon and a label.
 */
export function StockHealth({ data }: { data: DashboardSummary }) {
  const reduce = useReducedMotion()
  const total = data.total_products
  const counts = {
    healthy: Math.max(0, total - data.low_stock_count - data.out_of_stock_count),
    low: data.low_stock_count,
    out: data.out_of_stock_count,
  }
  const healthyPct = total ? Math.round((counts.healthy / total) * 100) : 0
  const items = callouts(data)

  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-fg">At a glance</h2>
          <p className="mt-0.5 text-[13px] text-muted">Stock health across the catalogue</p>
        </div>
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-[40px] font-semibold leading-none tracking-[-0.03em] text-fg">
          <AnimatedNumber value={healthyPct} format={(n) => `${Math.round(n)}%`} />
        </span>
        <span className="text-[13px] text-muted">
          of {pluralize(total, 'product')} well stocked
        </span>
      </div>

      {/* Part-to-whole meter: 2px gaps between segments, each labelled below. */}
      <div
        className="mt-4 flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-fg/[0.06]"
        role="img"
        aria-label={`${counts.healthy} healthy, ${counts.low} low, ${counts.out} out of stock`}
      >
        {total > 0 &&
          SEGMENTS.map((s, i) =>
            counts[s.key] ? (
              <motion.div
                key={s.key}
                className={cn('h-full first:rounded-l-full last:rounded-r-full', s.bar)}
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${(counts[s.key] / total) * 100}%` }}
                transition={{ duration: 0.7, delay: 0.1 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              />
            ) : null,
          )}
      </div>
      <ul className="mt-2.5 grid grid-cols-3 gap-2">
        {SEGMENTS.map((s) => {
          const Icon = s.icon
          return (
            <li key={s.key}>
              <Link to={s.to} className="focus-ring group flex items-center gap-1.5 rounded text-[12.5px] text-muted hover:text-fg">
                <span className={cn('h-2 w-2 shrink-0 rounded-full', s.bar)} aria-hidden />
                <Icon className="h-3.5 w-3.5 shrink-0 text-subtle group-hover:text-muted" aria-hidden />
                <span>{s.label}</span>
                <span className="tabular ml-auto font-semibold text-fg">{formatQty(counts[s.key])}</span>
              </Link>
            </li>
          )
        })}
      </ul>

      <div className="mt-5 border-t border-border pt-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.06em] text-subtle">Needs you</p>
        {items.length === 0 ? (
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-2.5 rounded-md bg-success-soft px-3 py-2.5 text-[13px] font-medium text-success"
          >
            <motion.span
              initial={reduce ? false : { rotate: -30, scale: 0.5 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 380, damping: 14, delay: 0.15 }}
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden />
            </motion.span>
            All clear. Nothing needs attention.
          </motion.div>
        ) : (
          <ul className="space-y-1.5">
            {items.map((c, i) => {
              const Icon = c.icon
              return (
                <motion.li
                  key={c.key}
                  initial={reduce ? false : { opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, delay: 0.2 + i * 0.05 }}
                >
                  <Link
                    to={c.to}
                    className="focus-ring group -mx-1.5 flex items-center gap-2.5 rounded-md px-1.5 py-1.5 transition-colors hover:bg-fg/[0.035]"
                  >
                    <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', TONE[c.tone])}>
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <span className="flex-1 text-[13px] text-fg">{c.text}</span>
                    <ChevronRight
                      className="h-3.5 w-3.5 text-subtle transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-accent"
                      aria-hidden
                    />
                  </Link>
                </motion.li>
              )
            })}
          </ul>
        )}
      </div>
    </Card>
  )
}
