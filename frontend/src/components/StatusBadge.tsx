import { STATUS_LABELS } from '@/features/operations/config'
import type { OperationStatus } from '@/types/api'
import { Badge, type Tone } from './ui/Badge'

const TONES: Record<OperationStatus, Tone> = {
  draft: 'muted',
  waiting: 'warning',
  ready: 'info',
  done: 'success',
  canceled: 'neutral',
}

export function StatusBadge({ status, className }: { status: OperationStatus; className?: string }) {
  return (
    <Badge tone={TONES[status]} dot className={className}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}

export function StockBadge({ out, low }: { out: boolean; low: boolean }) {
  if (out) return <Badge tone="danger" dot>Out of stock</Badge>
  if (low) return <Badge tone="warning" dot>Low stock</Badge>
  return <Badge tone="success" dot>In stock</Badge>
}
