import { AlertTriangle, MapPin, Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { TableSkeleton } from '@/components/ui/Table'
import { LocationDialog } from '@/features/settings/LocationDialog'
import { LocationStockDialog } from '@/features/settings/LocationStockDialog'
import { LocationsTable } from '@/features/settings/LocationsTable'
import { useLocations, useWarehouses } from '@/hooks/useWarehouses'
import { errorMessage } from '@/lib/errors'
import type { Location } from '@/types/api'

export default function Locations() {
  const [warehouseId, setWarehouseId] = useState('')
  const { data: warehouses } = useWarehouses()
  const { data, isLoading, isError, error, refetch } = useLocations(warehouseId || undefined)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Location | null>(null)
  const [viewing, setViewing] = useState<Location | null>(null)

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Settings' }, { label: 'Locations' }]}
        title="Locations"
        description="Racks, rooms and zones inside each warehouse."
        actions={
          <Button
            variant="primary"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setEditing(null)
              setOpen(true)
            }}
          >
            New location
          </Button>
        }
      />
      <div className="mb-4 max-w-xs">
        <Select aria-label="Warehouse" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
          <option value="">All warehouses</option>
          {warehouses?.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
      </div>
      <Card className="overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={6} cols={4} />
        ) : isError ? (
          <EmptyState icon={AlertTriangle} title="Couldn't load locations" description={errorMessage(error)} action={<Button onClick={() => refetch()}>Try again</Button>} />
        ) : !data || data.length === 0 ? (
          <EmptyState icon={MapPin} title="No locations yet" />
        ) : (
          <LocationsTable
            items={data}
            showWarehouse
            onOpen={setViewing}
            onEdit={(l) => {
              setEditing(l)
              setOpen(true)
            }}
          />
        )}
      </Card>
      <LocationDialog open={open} onOpenChange={setOpen} location={editing} defaultWarehouseId={warehouseId || undefined} />
      <LocationStockDialog location={viewing} onClose={() => setViewing(null)} />
    </>
  )
}
