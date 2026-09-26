import { z } from 'zod'
import type { Operation, OperationInput, OperationType, ProductRef } from '@/types/api'

export interface LineValues {
  product: ProductRef | null
  quantity: string
}

export interface OperationFormValues {
  supplier_or_customer: string
  source_location_id: string
  destination_location_id: string
  scheduled_date: string
  notes: string
  lines: LineValues[]
}

function quantityError(value: string, allowZero: boolean): string | null {
  const v = value.trim()
  if (!v) return 'Required'
  const n = Number(v)
  if (!Number.isFinite(n)) return 'Enter a number'
  if (allowZero ? n < 0 : n <= 0) return allowZero ? '0 or more' : 'Must be more than 0'
  if (!/^\d+(\.\d{1,3})?$/.test(v)) return 'Up to 3 decimals'
  return null
}

const productRef = z.object({ id: z.string(), name: z.string(), sku: z.string(), unit_of_measure: z.string() })

export function isBlankLine(l: LineValues): boolean {
  return l.product === null && l.quantity.trim() === ''
}

export function operationSchema(type: OperationType) {
  return z
    .object({
      supplier_or_customer: z.string().max(200, 'Too long'),
      source_location_id: z.string(),
      destination_location_id: z.string(),
      scheduled_date: z.string(),
      notes: z.string().max(2000, 'Too long'),
      lines: z.array(z.object({ product: productRef.nullable(), quantity: z.string() })).max(200),
    })
    .superRefine((v, ctx) => {
      if ((type === 'delivery' || type === 'transfer') && !v.source_location_id) {
        ctx.addIssue({ code: 'custom', path: ['source_location_id'], message: 'Choose a source location' })
      }
      if (type !== 'delivery' && !v.destination_location_id) {
        ctx.addIssue({
          code: 'custom',
          path: ['destination_location_id'],
          message: type === 'adjustment' ? 'Choose a location' : 'Choose a destination',
        })
      }
      if (type === 'transfer' && v.source_location_id && v.source_location_id === v.destination_location_id) {
        ctx.addIssue({ code: 'custom', path: ['destination_location_id'], message: 'Must differ from source' })
      }
      const seen = new Set<string>()
      v.lines.forEach((l, i) => {
        if (isBlankLine(l)) return // trailing empty rows are ignored
        if (!l.product) {
          ctx.addIssue({ code: 'custom', path: ['lines', i, 'product'], message: 'Choose a product' })
        } else if (seen.has(l.product.id)) {
          ctx.addIssue({ code: 'custom', path: ['lines', i, 'product'], message: 'Already added above' })
        } else {
          seen.add(l.product.id)
        }
        const qErr = quantityError(l.quantity, type === 'adjustment')
        if (qErr) ctx.addIssue({ code: 'custom', path: ['lines', i, 'quantity'], message: qErr })
      })
    })
}

export function emptyValues(prefill?: ProductRef | null): OperationFormValues {
  return {
    supplier_or_customer: '',
    source_location_id: '',
    destination_location_id: '',
    scheduled_date: '',
    notes: '',
    lines: [{ product: prefill ?? null, quantity: '' }],
  }
}

export function toFormValues(op: Operation): OperationFormValues {
  return {
    supplier_or_customer: op.supplier_or_customer ?? '',
    source_location_id: op.source_location?.id ?? '',
    destination_location_id: op.destination_location?.id ?? '',
    scheduled_date: op.scheduled_date ?? '',
    notes: op.notes ?? '',
    lines: op.lines.map((l) => ({ product: l.product, quantity: String(l.quantity) })),
  }
}

export function toPayload(type: OperationType, v: OperationFormValues): OperationInput {
  return {
    supplier_or_customer: type === 'receipt' || type === 'delivery' ? v.supplier_or_customer.trim() || null : null,
    source_location_id: type === 'delivery' || type === 'transfer' ? v.source_location_id || null : null,
    destination_location_id: type === 'delivery' ? null : v.destination_location_id || null,
    scheduled_date: v.scheduled_date || null,
    notes: v.notes.trim() || null,
    lines: v.lines
      .filter((l): l is LineValues & { product: ProductRef } => !isBlankLine(l) && l.product !== null)
      .map((l) => ({ product_id: l.product.id, quantity: Number(l.quantity) })),
  }
}

/** Maps server field paths ("lines.1.quantity") to form paths. Lines submitted skip blank rows, so
 * the server index refers to the filtered list — translate it back to the form row index. */
export function serverFieldMapper(v: OperationFormValues) {
  const kept = v.lines
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => !isBlankLine(l) && l.product !== null)
    .map(({ i }) => i)
  return (field: string): string | null => {
    const m = /^lines\.(\d+)\.(product_id|quantity)$/.exec(field)
    if (m) {
      const formIndex = kept[Number(m[1])]
      if (formIndex === undefined) return null
      return `lines.${formIndex}.${m[2] === 'product_id' ? 'product' : 'quantity'}`
    }
    if (['supplier_or_customer', 'source_location_id', 'destination_location_id', 'scheduled_date', 'notes'].includes(field)) {
      return field
    }
    return null
  }
}
