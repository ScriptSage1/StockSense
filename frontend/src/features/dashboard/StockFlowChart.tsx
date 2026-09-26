import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { cn, formatQty, formatSigned, parseDateOnly } from '@/lib/utils'
import type { FlowDay } from '@/types/api'

const HEIGHT = 176
const PAD = { top: 12, bottom: 26, left: 4, right: 4 }
const dayFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    ro.observe(node)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

/** SVG path of a bar with 4px rounding only on its data end; the baseline end stays square. */
function bar(x: number, base: number, w: number, h: number, up: boolean): string {
  const r = Math.min(4, w / 2, h)
  if (h <= 0) return ''
  if (up) {
    const top = base - h
    return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${base}Z`
  }
  const bottom = base + h
  return `M${x},${base}V${bottom - r}Q${x},${bottom} ${x + r},${bottom}H${x + w - r}Q${x + w},${bottom} ${x + w},${bottom - r}V${base}Z`
}

/**
 * Units in vs units out per day, as a diverging column chart around a zero line:
 * arrivals rise above it, departures hang below. Hover a day for its numbers.
 */
export function StockFlowChart({ days }: { days: FlowDay[] }) {
  const reduce = useReducedMotion()
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  const totalIn = days.reduce((s, d) => s + d.inbound, 0)
  const totalOut = days.reduce((s, d) => s + d.outbound, 0)
  const peak = Math.max(1, ...days.map((d) => Math.max(d.inbound, d.outbound)))
  const empty = totalIn === 0 && totalOut === 0

  const plotW = Math.max(0, width - PAD.left - PAD.right)
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const base = PAD.top + plotH / 2
  const half = plotH / 2 - 2
  const slot = days.length ? plotW / days.length : 0
  const barW = Math.max(3, Math.min(22, slot * 0.56))
  const scale = (v: number) => (v / peak) * half
  const labelEvery = slot < 34 ? (slot < 22 ? 7 : 3) : 1
  const active = hover !== null ? days[hover] : null

  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-fg">Stock movement</h2>
          <p className="mt-0.5 text-[13px] text-muted">Units in and out, last {days.length} days</p>
        </div>
        {/* Legend doubles as the totals (direct labels for both series). */}
        <dl className="flex gap-5 text-[13px]">
          <div>
            <dt className="flex items-center gap-1.5 text-muted">
              <span className="h-2.5 w-2.5 rounded-sm bg-viz-in" aria-hidden /> In
            </dt>
            <dd className="tabular mt-0.5 text-lg font-semibold text-fg">{formatQty(totalIn)}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-muted">
              <span className="h-2.5 w-2.5 rounded-sm bg-viz-out" aria-hidden /> Out
            </dt>
            <dd className="tabular mt-0.5 text-lg font-semibold text-fg">{formatQty(totalOut)}</dd>
          </div>
          <div>
            <dt className="text-muted">Net</dt>
            <dd className={cn('tabular mt-0.5 text-lg font-semibold', totalIn - totalOut < 0 ? 'text-emphasis' : 'text-fg')}>
              {formatSigned(totalIn - totalOut)}
            </dd>
          </div>
        </dl>
      </div>

      <div ref={ref} className="relative mt-4 flex-1" style={{ minHeight: HEIGHT }} onMouseLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label={`Units in ${formatQty(totalIn)}, out ${formatQty(totalOut)} over ${days.length} days`}>
            {/* hover column */}
            {hover !== null && (
              <rect
                x={PAD.left + hover * slot + 1}
                y={PAD.top - 4}
                width={slot - 2}
                height={plotH + 8}
                rx={6}
                className="fill-fg/[0.04]"
              />
            )}
            {/* guides at ± peak, recessive */}
            <line x1={PAD.left} x2={PAD.left + plotW} y1={base - half} y2={base - half} className="stroke-border" strokeWidth={1} />
            <line x1={PAD.left} x2={PAD.left + plotW} y1={base + half} y2={base + half} className="stroke-border" strokeWidth={1} />
            <text x={PAD.left + plotW} y={base - half - 3} textAnchor="end" className="fill-subtle text-[10px]">
              +{formatQty(peak)}
            </text>
            <text x={PAD.left + plotW} y={base + half + 11} textAnchor="end" className="fill-subtle text-[10px]">
              −{formatQty(peak)}
            </text>

            {days.map((d, i) => {
              const x = PAD.left + i * slot + (slot - barW) / 2
              const dim = hover !== null && hover !== i
              return (
                <g key={d.day} style={{ opacity: dim ? 0.45 : 1, transition: 'opacity 150ms' }}>
                  <motion.path
                    d={bar(x, base - 1, barW, scale(d.inbound), true)}
                    className="fill-viz-in"
                    initial={reduce ? false : { scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    style={{ originY: 1 }}
                    transition={{ duration: 0.5, delay: i * 0.025, ease: [0.16, 1, 0.3, 1] }}
                  />
                  <motion.path
                    d={bar(x, base + 1, barW, scale(d.outbound), false)}
                    className="fill-viz-out"
                    initial={reduce ? false : { scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    style={{ originY: 0 }}
                    transition={{ duration: 0.5, delay: 0.1 + i * 0.025, ease: [0.16, 1, 0.3, 1] }}
                  />
                  {(i % labelEvery === 0 || i === days.length - 1) && (i === days.length - 1 || days.length - 1 - i >= labelEvery / 2) && (
                    <text
                      x={PAD.left + i * slot + slot / 2}
                      y={HEIGHT - 6}
                      textAnchor="middle"
                      className={cn('text-[10.5px]', i === days.length - 1 ? 'fill-fg font-medium' : 'fill-subtle')}
                    >
                      {i === days.length - 1 ? 'Today' : dayFmt.format(parseDateOnly(d.day))}
                    </text>
                  )}
                  {/* generous hit target: the whole day column */}
                  <rect
                    x={PAD.left + i * slot}
                    y={0}
                    width={slot}
                    height={HEIGHT}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    onBlur={() => setHover(null)}
                    tabIndex={-1}
                  />
                </g>
              )
            })}
            {/* zero line on top of the bars */}
            <line x1={PAD.left} x2={PAD.left + plotW} y1={base} y2={base} className="stroke-border-strong" strokeWidth={1} />
          </svg>
        )}

        {empty && width > 0 && (
          <p className="pointer-events-none absolute inset-x-0 top-[calc(50%-28px)] text-center text-[13px] text-muted">
            No stock moved in this period
          </p>
        )}

        <AnimatePresence>
          {active && hover !== null && (
            <motion.div
              key="tip"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0, left: Math.min(Math.max(PAD.left + hover * slot + slot / 2, 70), width - 70) }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, left: { type: 'spring', stiffness: 500, damping: 40 } }}
              className="pointer-events-none absolute top-0 z-10 w-[140px] -translate-x-1/2 rounded-md border border-border bg-panel px-3 py-2 text-xs shadow-md"
            >
              <p className="font-medium text-fg">{weekdayFmt.format(parseDateOnly(active.day))}</p>
              <div className="mt-1.5 space-y-1">
                <p className="flex items-center gap-1.5 text-muted">
                  <span className="h-2 w-2 rounded-sm bg-viz-in" aria-hidden /> In
                  <span className="tabular ml-auto font-medium text-fg">{formatQty(active.inbound)}</span>
                </p>
                <p className="flex items-center gap-1.5 text-muted">
                  <span className="h-2 w-2 rounded-sm bg-viz-out" aria-hidden /> Out
                  <span className="tabular ml-auto font-medium text-fg">{formatQty(active.outbound)}</span>
                </p>
                <p className="flex items-center gap-1.5 border-t border-border pt-1 text-muted">
                  Net
                  <span className="tabular ml-auto font-medium text-fg">{formatSigned(active.inbound - active.outbound)}</span>
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Table view for screen readers. */}
      <table className="sr-only">
        <caption>Units moved per day</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>In</th>
            <th>Out</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.day}>
              <td>{d.day}</td>
              <td>{d.inbound}</td>
              <td>{d.outbound}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
