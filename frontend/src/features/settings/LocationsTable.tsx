import { Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table'
import type { Location } from '@/types/api'

export function LocationsTable({
  items,
  showWarehouse = false,
  onOpen,
  onEdit,
}: {
  items: Location[]
  showWarehouse?: boolean
  onOpen: (loc: Location) => void
  onEdit: (loc: Location) => void
}) {
  return (
    <Table>
      <THead>
        <tr>
          <TH>Code</TH>
          <TH>Name</TH>
          {showWarehouse && <TH className="hidden md:table-cell">Warehouse</TH>}
          <TH className="hidden sm:table-cell">Status</TH>
          <TH className="w-12">
            <span className="sr-only">Actions</span>
          </TH>
        </tr>
      </THead>
      <TBody>
        {items.map((loc) => (
          <TR key={loc.id} onActivate={() => onOpen(loc)} aria-label={`View stock in ${loc.full_code}`}>
            <TD className="font-mono text-[13px]">{loc.full_code}</TD>
            <TD className="font-medium">{loc.name}</TD>
            {showWarehouse && <TD className="hidden text-muted md:table-cell">{loc.warehouse.name}</TD>}
            <TD className="hidden sm:table-cell">
              {loc.is_active ? <Badge tone="success" dot>Active</Badge> : <Badge tone="muted" dot>Inactive</Badge>}
            </TD>
            <TD className="text-right">
              <Button variant="ghost" size="icon-sm" aria-label={`Edit ${loc.full_code}`} onClick={() => onEdit(loc)}>
                <Pencil className="h-4 w-4" />
              </Button>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  )
}
