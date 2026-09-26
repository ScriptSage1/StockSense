import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { STATUS_LABELS, STATUS_ORDER } from '@/features/operations/config'
import { cn, formatQty } from '@/lib/utils'
import type { OperationStatus } from '@/types/api'

// Same stage colours as the Open work chart.
const COLORS: Record<OperationStatus, string> = {
  draft: 'bg-viz-neutral',
  waiting: 'bg-viz-warn',
  ready: 'bg-viz-ready',
  done: 'bg-viz-good',
  canceled: 'bg-fg/25',
}

export function StatusMix({ counts, hrefFor }: { counts: Record<OperationStatus, number>; hrefFor: (s: OperationStatus) => string }) {
  const total = STATUS_ORDER.reduce((sum, s) => sum + (counts[s] ?? 0), 0)
  return (
    <div>
      <div className="flex h-2 w-full gap-[2px] overflow-hidden rounded-full bg-fg/[0.06]" role="img" aria-label="Operations by status">
        {total > 0 &&
          STATUS_ORDER.map((s) =>
            counts[s] ? (
              <motion.div
                key={s}
                className={cn('h-full', COLORS[s])}
                initial={{ width: 0 }}
                animate={{ width: `${(counts[s] / total) * 100}%` }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              />
            ) : null,
          )}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
        {STATUS_ORDER.map((s) => (
          <li key={s}>
            <Link to={hrefFor(s)} className="focus-ring flex items-center gap-2 rounded text-[13px] text-muted hover:text-fg">
              <span className={cn('h-2 w-2 rounded-full', COLORS[s])} aria-hidden />
              <span className="flex-1">{STATUS_LABELS[s]}</span>
              <span className="tabular font-medium text-fg">{formatQty(counts[s] ?? 0)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
