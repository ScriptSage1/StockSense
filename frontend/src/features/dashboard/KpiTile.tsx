import { motion, type Variants } from 'framer-motion'
import { ArrowUpRight, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { cn } from '@/lib/utils'

export const tileVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] } },
}

export function KpiTile({
  label,
  value,
  icon: Icon,
  to,
  sub,
  tone = 'default',
}: {
  label: string
  value: number
  icon: LucideIcon
  to: string
  sub?: ReactNode
  tone?: 'default' | 'alert'
}) {
  return (
    <motion.div variants={tileVariants}>
      <Link
        to={to}
        className={cn(
          'focus-ring group flex h-full flex-col rounded-lg border border-border bg-panel p-4 shadow-xs transition-[border-color,box-shadow,transform] duration-200',
          'hover:-translate-y-px hover:border-border-strong hover:shadow-sm',
        )}
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-[13px] font-medium text-muted">
            <Icon
              className={cn(
                'h-4 w-4 transition-transform duration-300 group-hover:-rotate-12 group-hover:scale-110',
                tone === 'alert' && value > 0 ? 'text-emphasis' : 'text-subtle',
              )}
              aria-hidden
            />
            {label}
          </span>
          <ArrowUpRight
            className="h-4 w-4 text-subtle opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
            aria-hidden
          />
        </div>
        <div
          className={cn(
            'mt-3 text-[28px] font-semibold leading-none tracking-[-0.02em]',
            tone === 'alert' && value > 0 ? 'text-emphasis' : 'text-fg',
          )}
        >
          <AnimatedNumber value={value} />
        </div>
        {sub && <div className="mt-2 text-xs text-muted">{sub}</div>}
      </Link>
    </motion.div>
  )
}
