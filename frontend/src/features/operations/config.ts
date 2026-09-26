import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, ClipboardCheck, type LucideIcon } from 'lucide-react'
import type { OperationStatus, OperationType } from '@/types/api'

export interface OperationTypeConfig {
  type: OperationType
  label: string
  plural: string
  slug: string
  icon: LucideIcon
  contactLabel: string | null
  needsSource: boolean
  needsDestination: boolean
  /** Status path shown in the progress stepper. */
  steps: OperationStatus[]
}

export const OPERATION_TYPES: Record<OperationType, OperationTypeConfig> = {
  receipt: {
    type: 'receipt',
    label: 'Receipt',
    plural: 'Receipts',
    slug: 'receipts',
    icon: ArrowDownToLine,
    contactLabel: 'Supplier',
    needsSource: false,
    needsDestination: true,
    steps: ['draft', 'ready', 'done'],
  },
  delivery: {
    type: 'delivery',
    label: 'Delivery',
    plural: 'Delivery orders',
    slug: 'deliveries',
    icon: ArrowUpFromLine,
    contactLabel: 'Customer',
    needsSource: true,
    needsDestination: false,
    steps: ['draft', 'waiting', 'ready', 'done'],
  },
  transfer: {
    type: 'transfer',
    label: 'Transfer',
    plural: 'Internal transfers',
    slug: 'transfers',
    icon: ArrowLeftRight,
    contactLabel: null,
    needsSource: true,
    needsDestination: true,
    steps: ['draft', 'waiting', 'ready', 'done'],
  },
  adjustment: {
    type: 'adjustment',
    label: 'Adjustment',
    plural: 'Adjustments',
    slug: 'adjustments',
    icon: ClipboardCheck,
    contactLabel: null,
    needsSource: false,
    needsDestination: true,
    steps: ['draft', 'ready', 'done'],
  },
}

export const TYPE_BY_SLUG: Record<string, OperationType> = Object.fromEntries(
  Object.values(OPERATION_TYPES).map((c) => [c.slug, c.type]),
) as Record<string, OperationType>

export function operationPath(type: OperationType, id?: string): string {
  const base = `/operations/${OPERATION_TYPES[type].slug}`
  return id ? `${base}/${id}` : base
}

export const STATUS_LABELS: Record<OperationStatus, string> = {
  draft: 'Draft',
  waiting: 'Waiting',
  ready: 'Ready',
  done: 'Done',
  canceled: 'Canceled',
}

export const STATUS_ORDER: OperationStatus[] = ['draft', 'waiting', 'ready', 'done', 'canceled']

export const OPEN_STATUSES: OperationStatus[] = ['draft', 'waiting', 'ready']
