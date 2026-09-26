import { forwardRef, useState } from 'react'
import { Combobox } from '@/components/ui/Combobox'
import { useDebounce } from '@/hooks/useDebounce'
import { useProducts } from '@/hooks/useProducts'
import { formatQty } from '@/lib/utils'
import type { ProductRef } from '@/types/api'

interface Props {
  value: ProductRef | null
  onChange: (product: ProductRef) => void
  excludeIds?: string[]
  /** Optional live availability shown next to each option (e.g. stock at the source location). */
  availability?: Map<string, number>
  disabled?: boolean
  id?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
  'aria-label'?: string
}

export const ProductPicker = forwardRef<HTMLButtonElement, Props>(function ProductPicker(
  { value, onChange, excludeIds = [], availability, disabled, ...aria },
  ref,
) {
  const [query, setQuery] = useState('')
  const q = useDebounce(query, 250)
  const { data, isFetching } = useProducts({ q: q || undefined, page_size: 25, sort: 'name' })
  const items = (data?.items ?? []).map((p) => ({
    id: p.id,
    label: p.name,
    sublabel: p.sku,
    disabled: excludeIds.includes(p.id) && p.id !== value?.id,
    meta: availability ? `${formatQty(availability.get(p.id) ?? 0)} ${p.unit_of_measure}` : undefined,
  }))
  return (
    <Combobox
      ref={ref}
      value={value?.id ?? null}
      selectedLabel={
        value ? (
          <span>
            <span className="font-mono text-xs text-muted">{value.sku}</span> <span>{value.name}</span>
          </span>
        ) : null
      }
      items={items}
      onQueryChange={setQuery}
      loading={isFetching}
      placeholder="Select product"
      searchPlaceholder="Search name or SKU"
      emptyText="No products found"
      disabled={disabled}
      onSelect={(item) => {
        const p = data?.items.find((x) => x.id === item.id)
        if (p) onChange({ id: p.id, name: p.name, sku: p.sku, unit_of_measure: p.unit_of_measure })
      }}
      {...aria}
    />
  )
})
