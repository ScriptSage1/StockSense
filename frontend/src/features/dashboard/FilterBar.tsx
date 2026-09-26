import { X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import type { DashboardFilters } from '@/api/endpoints'
import { OPERATION_TYPES, STATUS_LABELS, STATUS_ORDER } from '@/features/operations/config'
import { useCategories } from '@/hooks/useProducts'
import { useLocations, useWarehouses } from '@/hooks/useWarehouses'
import type { OperationStatus, OperationType } from '@/types/api'

export function FilterBar({ value, onChange }: { value: DashboardFilters; onChange: (f: DashboardFilters) => void }) {
  const { data: warehouses } = useWarehouses()
  const { data: locations } = useLocations(value.warehouse_id)
  const { data: categories } = useCategories()
  const active = Object.values(value).some(Boolean)
  const set = (patch: Partial<DashboardFilters>) => onChange({ ...value, ...patch })

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-center">
      <Select
        aria-label="Document type"
        value={value.type ?? ''}
        onChange={(e) => set({ type: (e.target.value || undefined) as OperationType | undefined })}
        className="lg:w-40"
      >
        <option value="">All documents</option>
        {Object.values(OPERATION_TYPES).map((t) => (
          <option key={t.type} value={t.type}>
            {t.plural}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Status"
        value={value.status ?? ''}
        onChange={(e) => set({ status: (e.target.value || undefined) as OperationStatus | undefined })}
        className="lg:w-36"
      >
        <option value="">Open statuses</option>
        {STATUS_ORDER.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Warehouse"
        value={value.warehouse_id ?? ''}
        onChange={(e) => set({ warehouse_id: e.target.value || undefined, location_id: undefined })}
        className="lg:w-44"
      >
        <option value="">All warehouses</option>
        {warehouses?.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Location"
        value={value.location_id ?? ''}
        onChange={(e) => set({ location_id: e.target.value || undefined })}
        className="lg:w-44"
      >
        <option value="">All locations</option>
        {locations?.map((l) => (
          <option key={l.id} value={l.id}>
            {l.full_code}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Product category"
        value={value.category_id ?? ''}
        onChange={(e) => set({ category_id: e.target.value || undefined })}
        className="lg:w-44"
      >
        <option value="">All categories</option>
        {categories?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      {active && (
        <Button variant="ghost" size="md" onClick={() => onChange({})} icon={<X className="h-4 w-4" />}>
          Clear
        </Button>
      )}
    </div>
  )
}
