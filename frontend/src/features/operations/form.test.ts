import { describe, expect, it } from 'vitest'
import { operationSchema, serverFieldMapper, toPayload, type OperationFormValues } from './form'

const desk = { id: 'p-desk', name: 'Desk', sku: 'DESK001', unit_of_measure: 'unit' }
const chair = { id: 'p-chair', name: 'Chair', sku: 'CHAIR001', unit_of_measure: 'unit' }

const base: OperationFormValues = {
  supplier_or_customer: 'Azure Interior',
  source_location_id: 'loc-a',
  destination_location_id: '',
  scheduled_date: '2026-10-01',
  notes: '',
  lines: [],
}

describe('operation form', () => {
  it('builds a delivery payload, ignoring blank rows and destination', () => {
    const payload = toPayload('delivery', {
      ...base,
      destination_location_id: 'ignored',
      lines: [
        { product: desk, quantity: '6' },
        { product: null, quantity: '' },
      ],
    })
    expect(payload).toEqual({
      supplier_or_customer: 'Azure Interior',
      source_location_id: 'loc-a',
      destination_location_id: null,
      scheduled_date: '2026-10-01',
      notes: null,
      lines: [{ product_id: 'p-desk', quantity: 6 }],
    })
  })

  it('requires positive quantities for moves but allows 0 for adjustment counts', () => {
    const lines = [{ product: desk, quantity: '0' }]
    expect(operationSchema('delivery').safeParse({ ...base, lines }).success).toBe(false)
    expect(
      operationSchema('adjustment').safeParse({ ...base, source_location_id: '', destination_location_id: 'loc-a', lines }).success,
    ).toBe(true)
  })

  it('rejects duplicate products and same-location transfers', () => {
    const dup = operationSchema('delivery').safeParse({
      ...base,
      lines: [
        { product: desk, quantity: '1' },
        { product: desk, quantity: '2' },
      ],
    })
    expect(dup.success).toBe(false)
    const same = operationSchema('transfer').safeParse({ ...base, destination_location_id: 'loc-a', lines: [] })
    expect(same.success).toBe(false)
  })

  it('maps server line indexes back to form rows when blank rows were skipped', () => {
    const values: OperationFormValues = {
      ...base,
      lines: [
        { product: null, quantity: '' },
        { product: desk, quantity: '1' },
        { product: chair, quantity: '9' },
      ],
    }
    const map = serverFieldMapper(values)
    expect(map('lines.1.quantity')).toBe('lines.2.quantity')
    expect(map('lines.0.product_id')).toBe('lines.1.product')
    expect(map('source_location_id')).toBe('source_location_id')
    expect(map('something_else')).toBeNull()
  })
})
