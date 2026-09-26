import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'

/** Fades a dashboard block up into place, staggered by `index`. */
export function Reveal({ index = 0, className, children }: { index?: number; className?: string; children: ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.06 * index, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}
