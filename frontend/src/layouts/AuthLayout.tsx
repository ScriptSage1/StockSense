import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'
import { LogoFull } from '@/components/Logo'

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-bg">
      {/* Two soft, slowly drifting glows behind the card. Decorative only. */}
      <div className="pointer-events-none absolute inset-0 -z-0" aria-hidden>
        <div className="absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full bg-accent/[0.08] blur-3xl motion-safe:animate-drift" />
        <div className="absolute -bottom-32 -right-20 h-[480px] w-[480px] rounded-full bg-[#d69100]/[0.10] blur-3xl motion-safe:animate-drift-slow" />
      </div>
      <div className="relative flex flex-1 items-center justify-center px-4 py-12">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 12, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-[400px]"
        >
          <div className="mb-6 flex justify-center">
            <LogoFull />
          </div>
          <motion.div layout={!reduce} className="rounded-xl border border-border bg-panel p-6 shadow-md sm:p-8">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={title}
                initial={reduce ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -4 }}
                transition={{ duration: 0.16 }}
              >
                <h1 className="text-lg font-semibold tracking-[-0.015em] text-fg">{title}</h1>
                {subtitle && <p className="mt-1 text-[13px] text-muted">{subtitle}</p>}
              </motion.div>
            </AnimatePresence>
            <div className="mt-6">{children}</div>
          </motion.div>
          {footer && <div className="mt-5 text-center text-[13px] text-muted">{footer}</div>}
        </motion.div>
      </div>
      <footer className="relative pb-6 text-center text-xs text-subtle">StockSense Inventory</footer>
    </div>
  )
}

/** Horizontal slide between the steps of an auth flow (form → code). */
export const stepMotion = {
  initial: { opacity: 0, x: 16 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.24, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, x: -16, transition: { duration: 0.14 } },
} as const
