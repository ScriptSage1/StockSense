import type { HTMLAttributes, KeyboardEvent, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from './Skeleton'

export function Table({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('scrollbar-thin w-full overflow-x-auto', className)}>
      <table className="w-full border-separate border-spacing-0 text-sm">{children}</table>
    </div>
  )
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="[&_th]:sticky [&_th]:top-0 [&_th]:z-[1]">{children}</thead>
}

export function TH({ className, children, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        'h-9 whitespace-nowrap border-b border-border bg-surface px-4 text-left text-xs font-medium text-muted first:pl-5 last:pr-5',
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  )
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="[&>tr:last-child>td]:border-b-0">{children}</tbody>
}

interface TRProps extends HTMLAttributes<HTMLTableRowElement> {
  /** Makes the whole row activatable (click / Enter). Put a real link in the row as well. */
  onActivate?: () => void
}

export function TR({ className, onActivate, children, ...rest }: TRProps) {
  const onKeyDown = (e: KeyboardEvent<HTMLTableRowElement>) => {
    if (onActivate && e.key === 'Enter' && e.target === e.currentTarget) onActivate()
  }
  return (
    <tr
      className={cn(
        'group transition-colors duration-100',
        onActivate && 'cursor-pointer hover:bg-fg/[0.025] focus-visible:bg-accent-soft/60 focus-visible:outline-none',
        className,
      )}
      onClick={
        onActivate
          ? (e) => {
              const el = e.target as HTMLElement
              if (el.closest('a,button,input,select,textarea,[role="menuitem"]')) return
              onActivate()
            }
          : undefined
      }
      onKeyDown={onKeyDown}
      tabIndex={onActivate ? 0 : undefined}
      {...rest}
    >
      {children}
    </tr>
  )
}

export function TD({ className, children, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('h-12 border-b border-border px-4 align-middle first:pl-5 last:pr-5', className)} {...rest}>
      {children}
    </td>
  )
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-border" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-6 px-5 py-4">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className={cn('h-3.5', c === 0 ? 'w-28' : c === cols - 1 ? 'ml-auto w-14' : 'w-full max-w-[160px]')} />
          ))}
        </div>
      ))}
    </div>
  )
}
