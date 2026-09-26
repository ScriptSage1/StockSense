import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatQty } from '@/lib/utils'
import { Button } from './Button'

export function Pagination({
  page,
  pages,
  total,
  pageSize,
  onPage,
  label = 'results',
}: {
  page: number
  pages: number
  total: number
  pageSize: number
  onPage: (page: number) => void
  label?: string
}) {
  if (total === 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <nav
      className="flex items-center justify-between gap-3 border-t border-border px-5 py-3 text-[13px] text-muted"
      aria-label="Pagination"
    >
      <span className="tabular">
        {formatQty(from)}–{formatQty(to)} of {formatQty(total)} {label}
      </span>
      <div className="flex items-center gap-1">
        <Button size="icon-sm" variant="ghost" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="tabular min-w-[64px] text-center">
          {page} / {pages}
        </span>
        <Button size="icon-sm" variant="ghost" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  )
}
