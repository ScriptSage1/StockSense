import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { OPERATION_TYPES, operationPath } from '@/features/operations/config'
import { cn, formatQty } from '@/lib/utils'
import type { OperationType, TypeBreakdown } from '@/types/api'

/** Receipt / delivery overview, mirroring the "N to receive · late · waiting · operations" card in the mockups. */
export function FlowCard({ type, data }: { type: OperationType; data: TypeBreakdown }) {
  const cfg = OPERATION_TYPES[type]
  const Icon = cfg.icon
  const verb = type === 'receipt' ? 'to receive' : type === 'delivery' ? 'to deliver' : 'to process'
  const stats = [
    { label: 'Late', value: data.late, alert: data.late > 0 },
    { label: 'Waiting', value: data.waiting, alert: false },
    { label: 'Upcoming', value: data.upcoming, alert: false },
  ]
  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[13px] font-medium text-fg">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft text-accent">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          {cfg.plural}
        </span>
        <Link
          to={`${operationPath(type)}?status=open`}
          className="focus-ring rounded text-xs font-medium text-muted hover:text-accent"
        >
          {formatQty(data.open)} open
        </Link>
      </div>
      <Link
        to={`${operationPath(type)}?status=ready`}
        className="focus-ring group mt-4 flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2.5 transition-colors hover:border-accent/30 hover:bg-accent-soft/60"
      >
        <span className="text-sm text-fg">
          <span className="tabular text-lg font-semibold">{formatQty(data.ready)}</span>{' '}
          <span className="text-muted">{verb}</span>
        </span>
        <ArrowRight className="h-4 w-4 text-subtle transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
      </Link>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="text-xs text-muted">{s.label}</dt>
            <dd className={cn('tabular text-sm font-semibold', s.alert ? 'text-emphasis' : 'text-fg')}>{formatQty(s.value)}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}
