import { motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  ChevronRight,
  Inbox,
  Plus,
  RefreshCw,
} from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { DashboardFilters } from '@/api/endpoints'
import { Badge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DropdownContent, DropdownItem, DropdownMenu, DropdownTrigger } from '@/components/ui/DropdownMenu'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { TableSkeleton } from '@/components/ui/Table'
import { FilterBar } from '@/features/dashboard/FilterBar'
import { KpiTile } from '@/features/dashboard/KpiTile'
import { OpenWorkChart } from '@/features/dashboard/OpenWorkChart'
import { Reveal } from '@/features/dashboard/Reveal'
import { StatusMix } from '@/features/dashboard/StatusMix'
import { StockFlowChart } from '@/features/dashboard/StockFlowChart'
import { StockHealth } from '@/features/dashboard/StockHealth'
import { StockMeter } from '@/features/dashboard/StockMeter'
import { MovesList } from '@/features/ledger/MovesList'
import { OPERATION_TYPES, operationPath } from '@/features/operations/config'
import { OperationsTable } from '@/features/operations/OperationsTable'
import { useDashboard } from '@/hooks/useDashboard'
import { errorMessage } from '@/lib/errors'
import { formatQty, relativeTime } from '@/lib/utils'
import type { OperationStatus, OperationType } from '@/types/api'

const FILTER_KEYS = ['type', 'status', 'warehouse_id', 'location_id', 'category_id'] as const

function useFilterParams(): [DashboardFilters, (f: DashboardFilters) => void] {
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => {
    const f: Record<string, string> = {}
    for (const k of FILTER_KEYS) {
      const v = params.get(k)
      if (v) f[k] = v
    }
    return f as unknown as DashboardFilters
  }, [params])
  const set = (f: DashboardFilters) => {
    const next = new URLSearchParams()
    for (const [k, v] of Object.entries(f)) if (v) next.set(k, String(v))
    setParams(next, { replace: true })
  }
  return [filters, set]
}

export default function Dashboard() {
  const [filters, setFilters] = useFilterParams()
  const { data, isLoading, isError, error, refetch, isFetching } = useDashboard(filters)
  const navigate = useNavigate()

  const opsListHref = (type?: OperationType, status?: string) => {
    const t = type ?? filters.type ?? 'receipt'
    const qs = new URLSearchParams()
    if (status) qs.set('status', status)
    if (filters.warehouse_id) qs.set('warehouse_id', filters.warehouse_id)
    return `${operationPath(t)}${qs.toString() ? `?${qs}` : ''}`
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Inventory and operations at a glance."
        meta={
          data && (
            <span className="text-xs text-subtle" aria-live="polite">
              Updated {relativeTime(data.generated_at)}
            </span>
          )
        }
        actions={
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Refresh"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            </Button>
            <DropdownMenu>
              <DropdownTrigger asChild>
                <Button variant="primary" icon={<Plus className="h-4 w-4" />}>
                  New operation
                </Button>
              </DropdownTrigger>
              <DropdownContent>
                {Object.values(OPERATION_TYPES).map((c) => {
                  const Icon = c.icon
                  return (
                    <DropdownItem key={c.type} icon={<Icon />} onSelect={() => navigate(`${operationPath(c.type)}/new`)}>
                      {c.label}
                    </DropdownItem>
                  )
                })}
              </DropdownContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="mb-6">
        <FilterBar value={filters} onChange={setFilters} />
      </div>

      {isError && !data ? (
        <Card>
          <EmptyState
            icon={AlertTriangle}
            title="Dashboard unavailable"
            description={errorMessage(error)}
            action={<Button onClick={() => refetch()}>Try again</Button>}
          />
        </Card>
      ) : (
        <>
          {/* KPI strip */}
          {isLoading || !data ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="rounded-lg border border-border p-4">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="mt-4 h-7 w-16" />
                  <Skeleton className="mt-3 h-3 w-20" />
                </div>
              ))}
            </div>
          ) : (
            <motion.div
              className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
              initial="hidden"
              animate="show"
              variants={{ show: { transition: { staggerChildren: 0.04 } } }}
            >
              <KpiTile
                label="Products in stock"
                icon={Boxes}
                value={data.products_in_stock}
                to="/products?stock=in_stock"
                sub={`of ${formatQty(data.total_products)} products · ${formatQty(data.total_units)} units`}
              />
              <KpiTile
                label="Low / out of stock"
                icon={AlertTriangle}
                tone="alert"
                value={data.low_stock_count + data.out_of_stock_count}
                to="/products?stock=attention"
                sub={`${formatQty(data.low_stock_count)} low · ${formatQty(data.out_of_stock_count)} out`}
              />
              <KpiTile
                label="Pending receipts"
                icon={ArrowDownToLine}
                value={data.pending_receipts}
                to={opsListHref('receipt', 'open')}
                sub={data.receipts.late ? `${formatQty(data.receipts.late)} late` : `${formatQty(data.receipts.ready)} ready`}
              />
              <KpiTile
                label="Pending deliveries"
                icon={ArrowUpFromLine}
                value={data.pending_deliveries}
                to={opsListHref('delivery', 'open')}
                sub={`${formatQty(data.deliveries.waiting)} waiting on stock`}
              />
              <KpiTile
                label="Transfers scheduled"
                icon={ArrowLeftRight}
                value={data.scheduled_transfers}
                to={opsListHref('transfer', 'open')}
                sub={data.transfers.today ? `${formatQty(data.transfers.today)} today` : `${formatQty(data.transfers.ready)} ready`}
              />
            </motion.div>
          )}

          {/* At-a-glance row: health + what needs doing, and the last two weeks of movement. */}
          <div className="mt-6 grid gap-6 lg:grid-cols-5 xl:grid-cols-3">
            {data ? (
              <>
                <Reveal index={0} className="lg:col-span-2 xl:col-span-1">
                  <StockHealth data={data} />
                </Reveal>
                <Reveal index={1} className="lg:col-span-3 xl:col-span-2">
                  <StockFlowChart days={data.stock_flow} />
                </Reveal>
              </>
            ) : (
              <>
                <Skeleton className="h-[330px] rounded-lg lg:col-span-2 xl:col-span-1" />
                <Skeleton className="h-[330px] rounded-lg lg:col-span-3 xl:col-span-2" />
              </>
            )}
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-3">
            <div className="space-y-6 xl:col-span-2">
              {data ? (
                <Reveal index={2}>
                  <OpenWorkChart data={data} hrefFor={(t, s) => opsListHref(t, s)} />
                </Reveal>
              ) : (
                <Skeleton className="h-[220px] rounded-lg" />
              )}

              <Reveal index={3}>
              <Card>
                <CardHeader
                  title={filters.status ? `${filters.status[0].toUpperCase()}${filters.status.slice(1)} operations` : 'Open operations'}
                  description="Earliest scheduled first"
                  action={
                    <Link
                      to={opsListHref(undefined, filters.status ?? 'open')}
                      className="focus-ring inline-flex items-center gap-1 rounded text-[13px] font-medium text-muted hover:text-accent"
                    >
                      View all <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  }
                />
                <div className="mt-3">
                  {!data ? (
                    <TableSkeleton rows={5} cols={4} />
                  ) : data.pending_operations.length === 0 ? (
                    <EmptyState icon={Inbox} title="Nothing pending" description="New operations will appear here." />
                  ) : (
                    <OperationsTable items={data.pending_operations} showType />
                  )}
                </div>
              </Card>
              </Reveal>
            </div>

            <div className="space-y-6">
              <Reveal index={3}>
              <Card>
                <CardHeader
                  title="Needs attention"
                  description="At or below reorder point"
                  action={
                    data && data.low_stock_items.length > 0 ? (
                      <Link to="/products?stock=attention" className="focus-ring rounded text-[13px] font-medium text-muted hover:text-accent">
                        View all
                      </Link>
                    ) : undefined
                  }
                />
                <CardBody className="pt-2">
                  {!data ? (
                    <div className="space-y-3 py-2">
                      {Array.from({ length: 4 }, (_, i) => (
                        <Skeleton key={i} className="h-4 w-full" />
                      ))}
                    </div>
                  ) : data.low_stock_items.length === 0 ? (
                    <p className="py-6 text-center text-[13px] text-muted">All stock levels healthy</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {data.low_stock_items.map((p) => (
                        <li key={p.id} className="pb-2.5">
                          <Link
                            to={`/products/${p.id}`}
                            className="focus-ring -mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-fg/[0.025]"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[13px] font-medium text-fg">{p.name}</div>
                              <div className="font-mono text-xs text-muted">{p.sku}</div>
                            </div>
                            <div className="text-right">
                              <div className="tabular text-[13px] font-semibold text-fg">
                                {formatQty(p.total_on_hand)} <span className="font-normal text-muted">{p.unit_of_measure}</span>
                              </div>
                              {p.is_out_of_stock ? (
                                <Badge tone="danger">Out</Badge>
                              ) : (
                                <span className="text-xs text-muted">min {formatQty(p.reorder_point)}</span>
                              )}
                            </div>
                          </Link>
                          <StockMeter onHand={p.total_on_hand} reorderPoint={p.reorder_point} />
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
              </Reveal>

              <Reveal index={4}>
              <Card>
                <CardHeader title="Status mix" description={filters.type ? OPERATION_TYPES[filters.type].plural : 'All documents'} />
                <CardBody>
                  {data ? (
                    <StatusMix
                      counts={data.status_counts}
                      hrefFor={(s: OperationStatus) => opsListHref(undefined, s)}
                    />
                  ) : (
                    <Skeleton className="h-16 w-full" />
                  )}
                </CardBody>
              </Card>
              </Reveal>

              <Reveal index={5}>
              <Card>
                <CardHeader
                  title="Recent movement"
                  action={
                    <Link to="/history" className="focus-ring rounded text-[13px] font-medium text-muted hover:text-accent">
                      History
                    </Link>
                  }
                />
                <CardBody className="pt-1">
                  {!data ? (
                    <div className="space-y-3 py-2">
                      {Array.from({ length: 4 }, (_, i) => (
                        <Skeleton key={i} className="h-4 w-full" />
                      ))}
                    </div>
                  ) : data.recent_moves.length === 0 ? (
                    <p className="py-6 text-center text-[13px] text-muted">No stock moves yet</p>
                  ) : (
                    <MovesList items={data.recent_moves} />
                  )}
                </CardBody>
              </Card>
              </Reveal>
            </div>
          </div>
        </>
      )}
      {data && data.total_products === 0 && (
        <div className="mt-6">
          <Card>
            <EmptyState
              icon={Boxes}
              title="Add your first product"
              description="Products hold no quantity themselves — stock comes from receipts and adjustments."
              action={<ButtonLink to="/products/new" variant="primary">Create product</ButtonLink>}
            />
          </Card>
        </div>
      )}
    </>
  )
}
