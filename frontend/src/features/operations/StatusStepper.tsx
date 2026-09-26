import { motion } from 'framer-motion'
import { Check, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Burst } from '@/components/ui/Burst'
import { cn } from '@/lib/utils'
import type { OperationStatus, OperationType } from '@/types/api'
import { OPERATION_TYPES, STATUS_LABELS } from './config'

/** Draft → (Waiting) → Ready → Done progress indicator. */
export function StatusStepper({ type, status }: { type: OperationType; status: OperationStatus | 'new' }) {
  // Celebrate the moment an open operation becomes done (not when opening a finished one).
  const previous = useRef(status)
  const [celebrations, setCelebrations] = useState(0)
  useEffect(() => {
    if (status === 'done' && previous.current !== 'done' && previous.current !== 'new') setCelebrations((c) => c + 1)
    previous.current = status
  }, [status])

  if (status === 'canceled') {
    return (
      <div className="inline-flex items-center gap-2 rounded-md bg-fg/[0.05] px-2.5 py-1 text-[13px] font-medium text-muted">
        <X className="h-3.5 w-3.5" aria-hidden /> Canceled
      </div>
    )
  }
  const steps = OPERATION_TYPES[type].steps
  const current = status === 'new' ? -1 : steps.indexOf(status)
  return (
    <ol className="flex items-center gap-1" aria-label="Progress">
      {steps.map((s, i) => {
        const done = i < current || status === 'done'
        const active = i === current && status !== 'done'
        return (
          <li key={s} className="flex items-center gap-1">
            <span
              className={cn(
                'relative inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors',
                active ? 'text-accent' : done ? 'text-fg' : 'text-subtle',
              )}
              aria-current={active ? 'step' : undefined}
            >
              {active && (
                <motion.span
                  layoutId="stepper-active"
                  className="absolute inset-0 rounded-md bg-accent-soft"
                  transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
                />
              )}
              <span className="relative flex items-center gap-1.5">
                {done && (
                  <motion.span
                    key={celebrations}
                    initial={celebrations && s === 'done' ? { scale: 0, rotate: -45 } : false}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 13 }}
                    className="flex"
                  >
                    <Check className="h-3.5 w-3.5 text-success" aria-hidden />
                  </motion.span>
                )}
                {STATUS_LABELS[s]}
              </span>
              {s === 'done' && celebrations > 0 && <Burst key={celebrations} />}
            </span>
            {i < steps.length - 1 && <span className="h-px w-3 bg-border-strong sm:w-5" aria-hidden />}
          </li>
        )
      })}
    </ol>
  )
}
