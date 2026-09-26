import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const styles = {
  error: { box: 'border-danger/20 bg-danger-soft text-danger', Icon: AlertCircle },
  success: { box: 'border-success/20 bg-success-soft text-success', Icon: CheckCircle2 },
  info: { box: 'border-info/20 bg-info-soft text-info', Icon: Info },
}

export function FormAlert({ tone = 'error', children }: { tone?: keyof typeof styles; children?: ReactNode }) {
  const { box, Icon } = styles[tone]
  return (
    <AnimatePresence initial={false}>
      {children ? (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.18 }}
          className="overflow-hidden"
        >
          <div role={tone === 'error' ? 'alert' : 'status'} className={cn('mb-4 flex gap-2 rounded-md border px-3 py-2.5 text-[13px]', box)}>
            <Icon className="mt-px h-4 w-4 shrink-0" aria-hidden />
            <div>{children}</div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
