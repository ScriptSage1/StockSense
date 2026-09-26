import { AlertTriangle, Archive, ArrowDownToLine, ClipboardCheck, History, MapPin, MoreHorizontal, Pencil } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { PageLoader } from '@/components/PageLoader'
import { StockBadge } from '@/components/StatusBadge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { DropdownContent, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger } from '@/components/ui/DropdownMenu'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table'
import { useAuth } from '@/features/auth/AuthProvider'
import { MovesList } from '@/features/ledger/MovesList'
import { useLedger } from '@/hooks/useLedger'
import { useDeleteProduct, useProduct } from '@/hooks/useProducts'
import { errorMessage } from '@/lib/errors'
import { cn, formatQty } from '@/lib/utils'

function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'danger' | 'warning' }) {
  return (
    <div className="rounded-lg border border-border px-4 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd
        className={cn(
          'tabular mt-1 text-lg font-semibold tracking-[-0.01em]',
          tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-fg',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

export default function ProductDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { isManager } = useAuth()
  const { data: p, isLoading, isError, error } = useProduct(id)
  const moves = useLedger({ product_id: id, page_size: 8 }, Boolean(id))
  const remove = useDeleteProduct()
  const [confirm, setConfirm] = useState(false)

  if (isLoading) return <PageLoader />
  if (isError || !p) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Product unavailable"
        description={errorMessage(error)}
        action={<ButtonLink to="/products">Back to products</ButtonLink>}
      />
    )
  }

  const archive = async () => {
    try {
      await remove.mutateAsync(p.id)
      toast.success('Product archived')
      navigate('/products', { replace: true })
    } catch (err) {
      toast.error(errorMessage(err))
      setConfirm(false)
    }
  }

  const stocked = p.stock_by_location.filter((s) => s.quantity !== 0)

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Products', to: '/products' }, { label: p.sku }]}
        title={p.name}
        meta={<StockBadge out={p.is_out_of_stock} low={p.is_low_stock} />}
        description={
          <span>
            <span className="font-mono">{p.sku}</span>
            {p.category && <> · {p.category.name}</>}
          </span>
        }
        actions={
          <>
            <ButtonLink to={`/products/${p.id}/edit`} icon={<Pencil className="h-4 w-4" />}>
              Edit
            </ButtonLink>
            <DropdownMenu>
              <DropdownTrigger asChild>
                <Button size="icon" aria-label="More actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownTrigger>
              <DropdownContent>
                <DropdownItem icon={<ArrowDownToLine />} onSelect={() => navigate(`/operations/receipts/new?product=${p.id}`)}>
                  Receive stock
                </DropdownItem>
                <DropdownItem icon={<ClipboardCheck />} onSelect={() => navigate(`/operations/adjustments/new?product=${p.id}`)}>
                  Adjust stock
                </DropdownItem>
                <DropdownItem icon={<History />} onSelect={() => navigate(`/history?product=${p.id}`)}>
                  Move history
                </DropdownItem>
                {isManager && (
                  <>
                    <DropdownSeparator />
                    <DropdownItem icon={<Archive />} tone="danger" onSelect={() => setConfirm(true)}>
                      Archive product
                    </DropdownItem>
                  </>
                )}
              </DropdownContent>
            </DropdownMenu>
          </>
        }
      />

      <dl className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="On hand"
          value={
            <>
              {formatQty(p.total_on_hand)} <span className="text-sm font-normal text-muted">{p.unit_of_measure}</span>
            </>
          }
          tone={p.is_out_of_stock ? 'danger' : p.is_low_stock ? 'warning' : undefined}
        />
        <Stat label="Reorder point" value={formatQty(p.reorder_point)} />
        <Stat label="Locations" value={formatQty(stocked.length)} />
        <Stat label="Unit" value={<span className="text-base">{p.unit_of_measure}</span>} />
      </dl>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="overflow-hidden lg:col-span-3">
          <CardHeader title="Stock by location" description="Live quantities from the stock table" />
          <div className="mt-3">
            {stocked.length === 0 ? (
              <EmptyState
                icon={MapPin}
                title="Not stocked anywhere"
                description="Receive or adjust stock to place it in a location."
                action={
                  <ButtonLink to={`/operations/receipts/new?product=${p.id}`} variant="subtle" size="sm">
                    Receive stock
                  </ButtonLink>
                }
              />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Location</TH>
                    <TH className="hidden sm:table-cell">Warehouse</TH>
                    <TH className="text-right">Quantity</TH>
                  </tr>
                </THead>
                <TBody>
                  {stocked.map((s) => (
                    <TR key={s.location.id}>
                      <TD>
                        <span className="font-mono text-[13px] text-fg">{s.location.full_code}</span>
                        <span className="ml-2 text-muted">{s.location.name}</span>
                      </TD>
                      <TD className="hidden text-muted sm:table-cell">{s.warehouse_name}</TD>
                      <TD className="tabular text-right font-medium">
                        {formatQty(s.quantity)} <span className="text-xs font-normal text-muted">{p.unit_of_measure}</span>
                      </TD>
                    </TR>
                  ))}
                  <TR>
                    <TD className="font-medium">Total</TD>
                    <TD className="hidden sm:table-cell" />
                    <TD className="tabular text-right font-semibold">
                      {formatQty(p.total_on_hand)} <span className="text-xs font-normal text-muted">{p.unit_of_measure}</span>
                    </TD>
                  </TR>
                </TBody>
              </Table>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Recent movement"
            action={
              <Link to={`/history?product=${p.id}`} className="focus-ring rounded text-[13px] font-medium text-muted hover:text-accent">
                Full history
              </Link>
            }
          />
          <CardBody className="pt-1">
            {moves.isLoading ? (
              <div className="space-y-3 py-2">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            ) : !moves.data || moves.data.items.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-muted">No movement yet</p>
            ) : (
              <MovesList items={moves.data.items} />
            )}
          </CardBody>
        </Card>
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Archive product?"
        description="It will be hidden from the catalogue. History stays intact. Only possible with zero stock and no open operations."
        confirmLabel="Archive"
        tone="danger"
        loading={remove.isPending}
        onConfirm={archive}
      />
    </>
  )
}
