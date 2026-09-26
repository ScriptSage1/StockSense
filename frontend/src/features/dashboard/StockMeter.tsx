import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

/**
 * How much stock is left against the reorder point, as a thin meter: a full track means
 * "at the reorder point", an empty one means "out". Red when out, amber when low.
 */
export function StockMeter({ onHand, reorderPoint }: { onHand: number; reorderPoint: number | null }) {
  const reduce = useReducedMotion()
  if (!reorderPoint || reorderPoint <= 0) return null
  const ratio = Math.max(0, Math.min(1, onHand / reorderPoint))
  const out = onHand <= 0
  return (
    <div
      className="h-1 w-full overflow-hidden rounded-full bg-fg/[0.07]"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={reorderPoint}
      aria-valuenow={Math.max(0, onHand)}
      aria-label="Stock left before the reorder point"
    >
      <motion.div
        className={cn('h-full rounded-full', out ? 'bg-viz-bad' : 'bg-viz-warn')}
        initial={reduce ? false : { width: 0 }}
        animate={{ width: out ? '3%' : `${ratio * 100}%` }}
        transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  )
}
