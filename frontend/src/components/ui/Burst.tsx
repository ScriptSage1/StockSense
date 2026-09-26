import { motion, useReducedMotion } from 'framer-motion'

const COLORS = ['bg-viz-good', 'bg-viz-warn', 'bg-viz-in', 'bg-accent', 'bg-viz-out']

/** A small one-shot burst of dots for a moment worth celebrating. Remount (new `key`) to replay. */
export function Burst({ count = 12, radius = 34 }: { count?: number; radius?: number }) {
  const reduce = useReducedMotion()
  if (reduce) return null
  return (
    <span className="pointer-events-none absolute left-1/2 top-1/2 z-10" aria-hidden>
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + (i % 2 ? 0.2 : 0)
        const r = radius * (i % 3 === 0 ? 1.15 : i % 3 === 1 ? 0.85 : 1)
        return (
          <motion.span
            key={i}
            className={`absolute -ml-[3px] -mt-[3px] h-1.5 w-1.5 rounded-full ${COLORS[i % COLORS.length]}`}
            initial={{ x: 0, y: 0, scale: 0.4, opacity: 1 }}
            animate={{ x: Math.cos(angle) * r, y: Math.sin(angle) * r, scale: [0.4, 1.2, 0.6], opacity: [1, 1, 0] }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          />
        )
      })}
    </span>
  )
}
