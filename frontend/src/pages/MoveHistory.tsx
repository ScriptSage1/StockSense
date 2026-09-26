import { AlertTriangle, ArrowRight, History, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { LocationSelect } from '@/components/LocationSelect'
import { ProductPicker } from '@/components/ProductPicker'
import { QtyChange } from '@/components/QtyChange'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input, Select } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pagination } from '@/components/ui/Pagination'
import { SearchInput } from '@/components/ui/SearchInput'
import { Segmented } from '@/components/ui/Segmented'
import { Table, TableSkeleton, TBody, TD, TH, THead, TR } from '@/components/ui/Table'
import { OPERATION_TYPES, operationPath } from '@/features/operations/config'
import { useDebounce } from '@/hooks/useDebounce'
import { useLedger } from '@/hooks/useLedger'
import { useProduct } from '@/hooks/useProducts'
import { errorMessage } from '@/lib/errors'
import { cn, formatDateTime } from '@/lib/utils'
import type { LedgerEntry, OperationType } from '@/types/api'

const PAGE_SIZE = 25

function Endpoint({ e, side }: { e: LedgerEntry; side: 'from' | 'to' }) {
  const loc = side === 'from' ? e.from_location : e.to_location
  if (loc) return <span className="font-mono text-xs">{loc.full_code}</span>
  if (side === 'from' && e.type === 'receipt') return <span className="text-xs text-muted">{e.operation.supplier_or_customer ?? 'Vendor'}</span>
  if (side === 'to' && e.type === 'delivery') return <span className="text-xs text-muted">{e.operation.supplier_or_customer ?? 'Customer'}</span>
  if (e.type === 'adjustment') return <span className="text-xs text-muted">Adjustment</span>
  return <span className="text-xs text-subtle">—</span>
}

export default function MoveHistory() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const q = useDebounce(search.trim(), 300)
  const productId = params.get('product') ?? ''
  const locationId = params.get('location') ?? ''
  const operationId = params.get('operation') ?? ''
  const operationRef = params.get('ref') ?? ''
  const type = (params.get('type') ?? '') as OperationType | ''
  const direction = (params.get('direction') ?? 'all') as 'all' | 'in' | 'out'
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1)
  const { data: product } = useProduct(productId || undefined)

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    if (!('page' in patch)) next.delete('page')
    setParams(next, { replace: true })
  }

  useEffect(() => {
    if ((params.get('q') ?? '') !== q) update({ q: q || null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const invalidRange = Boolean(from && to && from > to)
  const { data, isLoading, isError, error, isFetching, refetch } = useLedger(
    {
      q: q || undefined,
      product_id: productId || undefined,
      location_id: locationId || undefined,
      operation_id: operationId || undefined,
      type: type || undefined,
      direction: direction === 'all' ? undefined : direction,
      from_date: from || undefined,
      to_date: to || undefined,
      page,
      page_size: PAGE_SIZE,
    },
    !invalidRange,
  )

  const anyFilter = Boolean(q || productId || locationId || operationId || type || direction !== 'all' || from || to)

  return (
    <>
      <PageHeader title="Move history" description="Every stock movement, append-only. Inbound in green, outbound in red." />

      <div className="mb-4 space-y-2">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Reference, contact or product" label="Search moves" />
          <ProductPicker
            value={product ? { id: product.id, name: product.name, sku: product.sku, unit_of_measure: product.unit_of_measure } : null}
            onChange={(p) => update({ product: p.id })}
            aria-label="Filter by product"
          />
          <LocationSelect
            aria-label="Filter by location"
            placeholder="All locations"
            includeInactive
            value={locationId}
            onChange={(e) => update({ location: e.target.value || null })}
          />
          <Select aria-label="Operation type" value={type} onChange={(e) => update({ type: e.target.value || null })}>
            <option value="">All types</option>
            {Object.values(OPERATION_TYPES).map((c) => (
              <option key={c.type} value={c.type}>
                {c.plural}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Segmented
            label="Direction"
            value={direction}
            onChange={(v) => update({ direction: v === 'all' ? null : v })}
            options={[
              { value: 'all', label: 'All' },
              { value: 'in', label: 'In' },
              { value: 'out', label: 'Out' },
            ]}
          />
          <div className="flex items-center gap-2">
            <Input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => update({ from: e.target.value || null })} className="w-[150px]" />
            <ArrowRight className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
            <Input
              type="date"
              aria-label="To date"
              value={to}
              min={from || undefined}
              onChange={(e) => update({ to: e.target.value || null })}
              className="w-[150px]"
              aria-invalid={invalidRange || undefined}
            />
          </div>
          {operationId && (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent-soft pl-2.5 pr-1 text-[13px] text-accent">
              <span className="font-mono">{operationRef || 'Operation'}</span>
              <button
                type="button"
                className="focus-ring flex h-6 w-6 items-center justify-center rounded hover:bg-accent/10"
                aria-label="Clear operation filter"
                onClick={() => update({ operation: null, ref: null })}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
          {anyFilter && (
            <Button
              variant="ghost"
              size="sm"
              className="sm:ml-auto"
              onClick={() => {
                setSearch('')
                setParams(new URLSearchParams(), { replace: true })
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
        {invalidRange && <p className="text-[12.5px] text-danger">Start date must be before end date.</p>}
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={10} cols={6} />
        ) : isError ? (
          <EmptyState icon={AlertTriangle} title="Couldn't load history" description={errorMessage(error)} action={<Button onClick={() => refetch()}>Try again</Button>} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState icon={History} title={anyFilter ? 'No matching moves' : 'No moves yet'} description={anyFilter ? 'Try widening the filters.' : 'Validated operations appear here.'} />
        ) : (
          <div className={cn('transition-opacity duration-150', isFetching && 'opacity-60')}>
            <Table>
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Reference</TH>
                  <TH>Product</TH>
                  <TH className="hidden md:table-cell">From → To</TH>
                  <TH className="text-right">Quantity</TH>
                  <TH className="hidden lg:table-cell">Type</TH>
                  <TH className="hidden xl:table-cell">By</TH>
                </tr>
              </THead>
              <TBody>
                {data.items.map((e) => {
                  const cfg = OPERATION_TYPES[e.type]
                  const Icon = cfg.icon
                  return (
                    <TR key={e.id}>
                      <TD className="tabular whitespace-nowrap text-[13px] text-muted">{formatDateTime(e.performed_at)}</TD>
                      <TD>
                        <Link to={operationPath(e.type, e.operation.id)} className="focus-ring rounded font-mono text-[13px] hover:text-accent">
                          {e.operation.reference}
                        </Link>
                      </TD>
                      <TD>
                        <Link to={`/products/${e.product.id}`} className="focus-ring block rounded hover:text-accent">
                          <span className="block max-w-[220px] truncate font-medium">{e.product.name}</span>
                          <span className="font-mono text-xs text-muted">{e.product.sku}</span>
                        </Link>
                      </TD>
                      <TD className="hidden md:table-cell">
                        <span className="inline-flex items-center gap-1.5">
                          <Endpoint e={e} side="from" />
                          <ArrowRight className="h-3 w-3 text-subtle" aria-label="to" />
                          <Endpoint e={e} side="to" />
                        </span>
                      </TD>
                      <TD className="text-right">
                        <QtyChange value={e.quantity} unit={e.product.unit_of_measure} className="text-[13px]" />
                      </TD>
                      <TD className="hidden lg:table-cell">
                        <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
                          <Icon className="h-3.5 w-3.5" aria-hidden />
                          {cfg.label}
                        </span>
                      </TD>
                      <TD className="hidden text-[13px] text-muted xl:table-cell">{e.performed_by.full_name}</TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
            <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.page_size} onPage={(p) => update({ page: String(p) })} label="moves" />
          </div>
        )}
      </Card>
    </>
  )
}
