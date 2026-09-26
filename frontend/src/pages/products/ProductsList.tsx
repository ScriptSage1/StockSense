import { AlertTriangle, PackagePlus, PackageSearch, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { StockBadge } from '@/components/StatusBadge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pagination } from '@/components/ui/Pagination'
import { SearchInput } from '@/components/ui/SearchInput'
import { Segmented } from '@/components/ui/Segmented'
import { Table, TableSkeleton, TBody, TD, TH, THead, TR } from '@/components/ui/Table'
import { useDebounce } from '@/hooks/useDebounce'
import { useCategories, useProducts } from '@/hooks/useProducts'
import { errorMessage } from '@/lib/errors'
import { cn, formatQty } from '@/lib/utils'
import type { StockFilter } from '@/types/api'

type StockTab = 'all' | StockFilter
const PAGE_SIZE = 20

export default function ProductsList() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') ?? '')
  const q = useDebounce(search.trim(), 300)
  const category = params.get('category') ?? ''
  const stock = (params.get('stock') as StockTab | null) ?? 'all'
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1)

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

  const { data: categories } = useCategories()
  const { data, isLoading, isError, error, isFetching, refetch } = useProducts({
    q: q || undefined,
    category_id: category || undefined,
    stock_status: stock === 'all' ? undefined : stock,
    page,
    page_size: PAGE_SIZE,
  })

  const filtered = Boolean(q || category || stock !== 'all')

  return (
    <>
      <PageHeader
        title="Products"
        description="Catalogue and on-hand stock across all locations."
        actions={
          <ButtonLink to="/products/new" variant="primary" icon={<Plus className="h-4 w-4" />}>
            New product
          </ButtonLink>
        }
      />

      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search name or SKU" className="lg:w-72" label="Search products" />
        <Select
          aria-label="Category"
          value={category}
          onChange={(e) => update({ category: e.target.value || null })}
          className="lg:w-48"
        >
          <option value="">All categories</option>
          {categories?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <div className="overflow-x-auto lg:ml-auto">
          <Segmented<StockTab>
            label="Stock status"
            value={stock}
            onChange={(v) => update({ stock: v === 'all' ? null : v })}
            options={[
              { value: 'all', label: 'All' },
              { value: 'in_stock', label: 'In stock' },
              { value: 'attention', label: 'Needs attention' },
              { value: 'out', label: 'Out' },
            ]}
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={8} cols={5} />
        ) : isError ? (
          <EmptyState
            icon={AlertTriangle}
            title="Couldn't load products"
            description={errorMessage(error)}
            action={<Button onClick={() => refetch()}>Try again</Button>}
          />
        ) : !data || data.items.length === 0 ? (
          filtered ? (
            <EmptyState icon={PackageSearch} title="No matching products" description="Try a different search or filter." />
          ) : (
            <EmptyState
              icon={PackagePlus}
              title="No products yet"
              action={
                <ButtonLink to="/products/new" variant="primary">
                  Create product
                </ButtonLink>
              }
            />
          )
        ) : (
          <div className={cn('transition-opacity duration-150', isFetching && 'opacity-60')}>
            <Table>
              <THead>
                <tr>
                  <TH>Product</TH>
                  <TH className="hidden md:table-cell">Category</TH>
                  <TH className="text-right">On hand</TH>
                  <TH className="hidden text-right lg:table-cell">Reorder at</TH>
                  <TH className="hidden text-right sm:table-cell">Status</TH>
                </tr>
              </THead>
              <TBody>
                {data.items.map((p) => (
                  <TR key={p.id} onActivate={() => navigate(`/products/${p.id}`)}>
                    <TD>
                      <Link to={`/products/${p.id}`} className="focus-ring block rounded">
                        <span className="block font-medium text-fg group-hover:text-accent">{p.name}</span>
                        <span className="font-mono text-xs text-muted">{p.sku}</span>
                      </Link>
                    </TD>
                    <TD className="hidden text-muted md:table-cell">{p.category?.name ?? '—'}</TD>
                    <TD className="text-right">
                      <span
                        className={cn(
                          'tabular font-medium',
                          p.is_out_of_stock ? 'text-danger' : p.is_low_stock ? 'text-warning' : 'text-fg',
                        )}
                      >
                        {formatQty(p.total_on_hand)}
                      </span>{' '}
                      <span className="text-xs text-muted">{p.unit_of_measure}</span>
                    </TD>
                    <TD className="tabular hidden text-right text-muted lg:table-cell">{formatQty(p.reorder_point)}</TD>
                    <TD className="hidden text-right sm:table-cell">
                      <StockBadge out={p.is_out_of_stock} low={p.is_low_stock} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination
              page={data.page}
              pages={data.pages}
              total={data.total}
              pageSize={data.page_size}
              onPage={(p) => update({ page: String(p) })}
              label="products"
            />
          </div>
        )}
      </Card>
    </>
  )
}
