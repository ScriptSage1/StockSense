import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'
import { Logo } from '@/components/Logo'

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-[400px]"
        >
          <div className="mb-8 flex justify-center">
            <Logo />
          </div>
          <div className="rounded-xl border border-border bg-panel p-6 shadow-sm sm:p-8">
            <h1 className="text-lg font-semibold tracking-[-0.015em] text-fg">{title}</h1>
            {subtitle && <p className="mt-1 text-[13px] text-muted">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div>
          {footer && <div className="mt-5 text-center text-[13px] text-muted">{footer}</div>}
        </motion.div>
      </div>
      <footer className="pb-6 text-center text-xs text-subtle">StockSense Inventory</footer>
    </div>
  )
}
