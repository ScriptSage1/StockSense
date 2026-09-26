import { Boxes } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, TableSkeleton, TBody, TD, TH, THead, TR } from '@/components/ui/Table'
import { useLocationStock } from '@/hooks/useWarehouses'
import { formatQty } from '@/lib/utils'
import type { Location } from '@/types/api'

/** Warehouse → Location → Stock: live on-hand for one location. */
export function LocationStockDialog({ location, onClose }: { location: Location | null; onClose: () => void }) {
  const { data, isLoading } = useLocationStock(location?.id ?? null)
  return (
    <Dialog
      open={Boolean(location)}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={location ? `${location.full_code} · ${location.name}` : ''}
      description={location ? `${location.warehouse.name} — live stock` : undefined}
    >
      <div className="-mx-5 -my-4">
        {isLoading ? (
          <TableSkeleton rows={4} cols={3} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState icon={Boxes} title="Empty location" description="No products are stocked here." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Product</TH>
                <TH className="text-right">On hand</TH>
              </tr>
            </THead>
            <TBody>
              {data.items.map((i) => (
                <TR key={i.product_id}>
                  <TD>
                    <Link to={`/products/${i.product_id}`} onClick={onClose} className="focus-ring rounded hover:text-accent">
                      <span className="mr-2 font-mono text-xs text-muted">{i.sku}</span>
                      <span className="font-medium">{i.name}</span>
                    </Link>
                  </TD>
                  <TD className="tabular text-right font-medium">
                    {formatQty(i.quantity)} <span className="text-xs font-normal text-muted">{i.unit_of_measure}</span>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </Dialog>
  )
}
