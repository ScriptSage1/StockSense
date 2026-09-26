import { forwardRef, type SelectHTMLAttributes } from 'react'
import { Select } from '@/components/ui/Input'
import { useLocations } from '@/hooks/useWarehouses'
import type { Location } from '@/types/api'

interface Props extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  placeholder?: string
  excludeId?: string | null
  includeInactive?: boolean
}

/** Native select grouped by warehouse (accessible, keyboard-friendly, mobile-friendly). */
export const LocationSelect = forwardRef<HTMLSelectElement, Props>(function LocationSelect(
  { placeholder = 'Select location', excludeId, includeInactive = false, ...rest },
  ref,
) {
  const { data, isLoading } = useLocations()
  const groups = new Map<string, { name: string; items: Location[] }>()
  for (const loc of data ?? []) {
    if (!includeInactive && !loc.is_active) continue
    if (loc.id === excludeId) continue
    const g = groups.get(loc.warehouse.id) ?? { name: `${loc.warehouse.name} (${loc.warehouse.short_code})`, items: [] }
    g.items.push(loc)
    groups.set(loc.warehouse.id, g)
  }
  return (
    <Select ref={ref} disabled={isLoading || rest.disabled} {...rest}>
      <option value="">{isLoading ? 'Loading…' : placeholder}</option>
      {[...groups.entries()].map(([id, g]) => (
        <optgroup key={id} label={g.name}>
          {g.items.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.full_code} · {loc.name}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  )
})
