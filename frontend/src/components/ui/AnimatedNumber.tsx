import { animate, useReducedMotion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { formatCompact } from '@/lib/utils'

/** Counts up to `value` on change; renders the final value immediately under reduced motion. */
export function AnimatedNumber({ value, format = formatCompact }: { value: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const previous = useRef(0)
  const reduce = useReducedMotion()

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (reduce) {
      node.textContent = format(value)
      previous.current = value
      return
    }
    const controls = animate(previous.current, value, {
      duration: 0.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        node.textContent = format(Number.isInteger(value) ? Math.round(v) : v)
      },
    })
    previous.current = value
    return () => controls.stop()
  }, [value, reduce, format])

  return (
    <span ref={ref} className="tabular">
      {format(value)}
    </span>
  )
}
