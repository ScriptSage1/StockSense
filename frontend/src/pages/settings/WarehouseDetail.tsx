import { AlertTriangle, MapPin, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { PageLoader } from '@/components/PageLoader'
import { Badge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { LocationDialog } from '@/features/settings/LocationDialog'
import { LocationStockDialog } from '@/features/settings/LocationStockDialog'
import { LocationsTable } from '@/features/settings/LocationsTable'
import { WarehouseDialog } from '@/features/settings/WarehouseDialog'
import { useLocations, useWarehouse } from '@/hooks/useWarehouses'
import { errorMessage } from '@/lib/errors'
import type { Location } from '@/types/api'

export default function WarehouseDetail() {
  const { id = '' } = useParams()
  const { data: wh, isLoading, isError, error } = useWarehouse(id)
  const { data: locations } = useLocations(id)
  const [whOpen, setWhOpen] = useState(false)
  const [locOpen, setLocOpen] = useState(false)
  const [editingLoc, setEditingLoc] = useState<Location | null>(null)
  const [viewing, setViewing] = useState<Location | null>(null)

  if (isLoading) return <PageLoader />
  if (isError || !wh) {
    return <EmptyState icon={AlertTriangle} title="Warehouse unavailable" description={errorMessage(error)} action={<ButtonLink to="/settings/warehouses">Back</ButtonLink>} />
  }
  const locs = locations ?? wh.locations

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Settings' }, { label: 'Warehouses', to: '/settings/warehouses' }, { label: wh.short_code }]}
        title={wh.name}
        meta={wh.is_active ? <Badge tone="success" dot>Active</Badge> : <Badge tone="muted" dot>Inactive</Badge>}
        description={wh.address || undefined}
        actions={
          <>
            <Button icon={<Pencil className="h-4 w-4" />} onClick={() => setWhOpen(true)}>
              Edit
            </Button>
            <Button
              variant="primary"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => {
                setEditingLoc(null)
                setLocOpen(true)
              }}
            >
              New location
            </Button>
          </>
        }
      />
      <Card className="overflow-hidden">
        <CardHeader title="Locations" description="Select a location to see its stock." className="pb-3" />
        {locs.length === 0 ? (
          <EmptyState icon={MapPin} title="No locations yet" description="Stock is always held in a location." />
        ) : (
          <LocationsTable
            items={locs}
            onOpen={setViewing}
            onEdit={(l) => {
              setEditingLoc(l)
              setLocOpen(true)
            }}
          />
        )}
      </Card>
      <WarehouseDialog open={whOpen} onOpenChange={setWhOpen} warehouse={wh} />
      <LocationDialog open={locOpen} onOpenChange={setLocOpen} location={editingLoc} defaultWarehouseId={wh.id} />
      <LocationStockDialog location={viewing} onClose={() => setViewing(null)} />
    </>
  )
}
