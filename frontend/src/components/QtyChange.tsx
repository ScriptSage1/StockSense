import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { cn, formatSigned } from '@/lib/utils'

/** Signed quantity: inbound (positive) in green, outbound (negative) in red, per the move-history spec. */
export function QtyChange({ value, unit, className }: { value: number; unit?: string; className?: string }) {
  const positive = value > 0
  const Icon = positive ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={cn(
        'tabular inline-flex items-center gap-1 font-medium',
        value === 0 ? 'text-muted' : positive ? 'text-success' : 'text-danger',
        className,
      )}
    >
      {value !== 0 && <Icon className="h-3.5 w-3.5" aria-hidden />}
      {formatSigned(value)}
      {unit && <span className="font-normal text-muted">{unit}</span>}
      <span className="sr-only">{positive ? 'in' : value < 0 ? 'out' : ''}</span>
    </span>
  )
}
