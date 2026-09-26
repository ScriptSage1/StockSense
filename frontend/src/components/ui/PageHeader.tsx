import { ChevronRight } from 'lucide-react'
import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

export interface Crumb {
  label: string
  to?: string
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-1.5">
      <ol className="flex flex-wrap items-center gap-1 text-[13px] text-muted">
        {items.map((c, i) => (
          <Fragment key={`${c.label}-${i}`}>
            <li>
              {c.to ? (
                <Link to={c.to} className="focus-ring rounded hover:text-fg">
                  {c.label}
                </Link>
              ) : (
                <span aria-current="page">{c.label}</span>
              )}
            </li>
            {i < items.length - 1 && (
              <li aria-hidden>
                <ChevronRight className="h-3.5 w-3.5 text-subtle" />
              </li>
            )}
          </Fragment>
        ))}
      </ol>
    </nav>
  )
}

export function PageHeader({
  title,
  description,
  actions,
  crumbs,
  meta,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  crumbs?: Crumb[]
  meta?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {crumbs && <Breadcrumbs items={crumbs} />}
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="truncate text-xl font-semibold tracking-[-0.015em] text-fg">{title}</h1>
          {meta}
        </div>
        {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
