import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Columns3, Inbox, List, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { StatusBadge } from '@/components/StatusBadge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pagination } from '@/components/ui/Pagination'
import { SearchInput } from '@/components/ui/SearchInput'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import { TableSkeleton } from '@/components/ui/Table'
import { Tooltip } from '@/components/ui/Tooltip'
import { OPERATION_TYPES, STATUS_LABELS, TYPE_BY_SLUG, operationPath } from '@/features/operations/config'
import { OperationsTable, Route, ScheduledDate } from '@/features/operations/OperationsTable'
import { useDebounce } from '@/hooks/useDebounce'
import { useOperations } from '@/hooks/useOperations'
import { useWarehouses } from '@/hooks/useWarehouses'
import { errorMessage } from '@/lib/errors'
import { cn, formatQty } from '@/lib/utils'
import type { OperationStatus, OperationSummary, OperationType } from '@/types/api'

type StatusTab = 'all' | 'open' | OperationStatus
type View = 'list' | 'board'
const PAGE_SIZE = 20
const VIEW_KEY = 'ss.operations.view'

function readView(): View {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'board' ? 'board' : 'list'
  } catch {
    return 'list'
  }
}

export default function OperationsList() {
  const { typeSlug = '' } = useParams()
  const type = TYPE_BY_SLUG[typeSlug]
  if (!type) return <Navigate to="/operations/receipts" replace />
  return <OperationsListInner key={type} type={type} />
}

function OperationsListInner({ type }: { type: OperationType }) {
  const cfg = OPERATION_TYPES[type]
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const q = useDebounce(search.trim(), 300)
  const status = (params.get('status') as StatusTab | null) ?? 'all'
  const warehouse = params.get('warehouse_id') ?? ''
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1)
  const [view, setView] = useState<View>(readView)
  const { data: warehouses } = useWarehouses()

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

  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_KEY, view)
    } catch {
      /* preference not persisted */
    }
  }, [view])

  const base = { type, q: q || undefined, warehouse_id: warehouse || undefined }
  const list = useOperations(
    { ...base, status: status === 'all' ? undefined : status, page, page_size: PAGE_SIZE, sort: '-created_at' },
    view === 'list',
  )
  const board = useOperations({ ...base, page_size: 100, sort: 'scheduled_date' }, view === 'board')

  const statusOptions: { value: StatusTab; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'open', label: 'Open' },
    ...cfg.steps.map((s) => ({ value: s as StatusTab, label: STATUS_LABELS[s] })),
    { value: 'canceled', label: 'Canceled' },
  ]
  const filtered = Boolean(q || warehouse || status !== 'all')
  const Icon = cfg.icon

  return (
    <>
      <PageHeader
        title={cfg.plural}
        description={
          type === 'receipt'
            ? 'Incoming goods from vendors.'
            : type === 'delivery'
              ? 'Outgoing goods to customers.'
              : type === 'transfer'
                ? 'Stock moved between locations.'
                : 'Corrections from physical counts.'
        }
        actions={
          <ButtonLink to={`${operationPath(type)}/new`} variant="primary" icon={<Plus className="h-4 w-4" />}>
            New {cfg.label.toLowerCase()}
          </ButtonLink>
        }
      />

      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={cfg.contactLabel ? `Reference, ${cfg.contactLabel.toLowerCase()} or product` : 'Reference or product'}
          className="lg:w-80"
          label={`Search ${cfg.plural.toLowerCase()}`}
        />
        <Select aria-label="Warehouse" value={warehouse} onChange={(e) => update({ warehouse_id: e.target.value || null })} className="lg:w-48">
          <option value="">All warehouses</option>
          {warehouses?.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
        <div className="flex items-center gap-2 lg:ml-auto">
          {view === 'list' && (
            <div className="overflow-x-auto">
              <Segmented<StatusTab> label="Status" value={status} onChange={(v) => update({ status: v === 'all' ? null : v })} options={statusOptions} />
            </div>
          )}
          <div className="flex rounded-lg bg-fg/[0.05] p-0.5" role="group" aria-label="View">
            <Tooltip content="List view">
              <Button
                size="icon-sm"
                variant="ghost"
                aria-pressed={view === 'list'}
                aria-label="List view"
                onClick={() => setView('list')}
                className={cn(view === 'list' && 'bg-panel text-fg shadow-sm hover:bg-panel')}
              >
                <List className="h-4 w-4" />
              </Button>
            </Tooltip>
            <Tooltip content="Board by status">
              <Button
                size="icon-sm"
                variant="ghost"
                aria-pressed={view === 'board'}
                aria-label="Board view"
                onClick={() => setView('board')}
                className={cn(view === 'board' && 'bg-panel text-fg shadow-sm hover:bg-panel')}
              >
                <Columns3 className="h-4 w-4" />
              </Button>
            </Tooltip>
          </div>
        </div>
      </div>

      {view === 'list' ? (
        <Card className="overflow-hidden">
          {list.isLoading ? (
            <TableSkeleton rows={8} cols={5} />
          ) : list.isError ? (
            <EmptyState
              icon={AlertTriangle}
              title="Couldn't load operations"
              description={errorMessage(list.error)}
              action={<Button onClick={() => list.refetch()}>Try again</Button>}
            />
          ) : !list.data || list.data.items.length === 0 ? (
            filtered ? (
              <EmptyState icon={Inbox} title="No matches" description="Try a different search or status." />
            ) : (
              <EmptyState
                icon={Icon}
                title={`No ${cfg.plural.toLowerCase()} yet`}
                action={
                  <ButtonLink to={`${operationPath(type)}/new`} variant="primary">
                    New {cfg.label.toLowerCase()}
                  </ButtonLink>
                }
              />
            )
          ) : (
            <div className={cn('transition-opacity duration-150', list.isFetching && 'opacity-60')}>
              <OperationsTable items={list.data.items} />
              <Pagination
                page={list.data.page}
                pages={list.data.pages}
                total={list.data.total}
                pageSize={list.data.page_size}
                onPage={(p) => update({ page: String(p) })}
                label={cfg.plural.toLowerCase()}
              />
            </div>
          )}
        </Card>
      ) : (
        <Board type={type} items={board.data?.items} loading={board.isLoading} total={board.data?.total ?? 0} />
      )}
    </>
  )
}

function Board({ type, items, loading, total }: { type: OperationType; items?: OperationSummary[]; loading: boolean; total: number }) {
  const cfg = OPERATION_TYPES[type]
  const columns: OperationStatus[] = [...cfg.steps, 'canceled']
  return (
    <div>
      <div className="scrollbar-thin -mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <div className="grid min-w-[880px] gap-3" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
          {columns.map((s) => {
            const col = (items ?? []).filter((o) => o.status === s)
            return (
              <section key={s} className="flex min-h-[200px] flex-col rounded-lg bg-surface p-2" aria-label={STATUS_LABELS[s]}>
                <header className="flex items-center justify-between px-1.5 pb-2 pt-1">
                  <StatusBadge status={s} />
                  <span className="tabular text-xs text-muted">{loading ? '' : formatQty(col.length)}</span>
                </header>
                <div className="space-y-2">
                  {loading ? (
                    <>
                      <Skeleton className="h-20 rounded-md" />
                      <Skeleton className="h-20 rounded-md" />
                    </>
                  ) : (
                    <AnimatePresence initial={false}>
                      {col.map((op) => (
                        <motion.div key={op.id} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                          <Link
                            to={operationPath(op.type, op.id)}
                            className="focus-ring block rounded-md border border-border bg-panel p-3 shadow-xs transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-sm"
                          >
                            <div className="font-mono text-[12.5px] font-medium text-fg">{op.reference}</div>
                            {op.supplier_or_customer && <div className="mt-0.5 truncate text-[13px] text-muted">{op.supplier_or_customer}</div>}
                            <div className="mt-2 text-xs">
                              <Route op={op} />
                            </div>
                            <div className="mt-2 flex items-center justify-between text-xs text-muted">
                              <ScheduledDate op={op} />
                              <span className="tabular">
                                {op.line_count} line{op.line_count === 1 ? '' : 's'}
                              </span>
                            </div>
                          </Link>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </div>
      {total > 100 && <p className="mt-2 text-xs text-muted">Showing the 100 earliest scheduled. Use the list view to see all.</p>}
    </div>
  )
}
