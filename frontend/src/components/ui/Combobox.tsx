import * as Popover from '@radix-ui/react-popover'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { forwardRef, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { controlClass } from './Input'
import { Spinner } from './Spinner'

export interface ComboItem {
  id: string
  label: string
  sublabel?: string
  meta?: ReactNode
  disabled?: boolean
}

interface ComboboxProps {
  value: string | null
  selectedLabel?: ReactNode
  items: ComboItem[]
  onSelect: (item: ComboItem) => void
  /** Server-side search. When omitted items are filtered client-side. */
  onQueryChange?: (q: string) => void
  loading?: boolean
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  className?: string
  id?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
  'aria-label'?: string
}

export const Combobox = forwardRef<HTMLButtonElement, ComboboxProps>(function Combobox(
  {
    value,
    selectedLabel,
    items,
    onSelect,
    onQueryChange,
    loading,
    placeholder = 'Select',
    searchPlaceholder = 'Search',
    emptyText = 'No matches',
    disabled,
    className,
    ...aria
  },
  ref,
) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()
  const listRef = useRef<HTMLUListElement>(null)

  const visible = onQueryChange
    ? items
    : items.filter((i) => `${i.label} ${i.sublabel ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))

  useEffect(() => {
    setActive(0)
  }, [query, open])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  useEffect(() => {
    onQueryChange?.(query)
  }, [query, onQueryChange])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const choose = (item: ComboItem | undefined) => {
    if (!item || item.disabled) return
    onSelect(item)
    setOpen(false)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, visible.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(visible[active])
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild disabled={disabled}>
        <button
          ref={ref}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          className={cn(controlClass, 'flex h-9 items-center justify-between gap-2 text-left', className)}
          {...aria}
        >
          <span className={cn('min-w-0 flex-1 truncate', !value && 'text-subtle')}>
            {value ? selectedLabel : placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-[var(--radix-popover-trigger-width)] min-w-[280px] overflow-hidden rounded-lg border border-border bg-panel shadow-md data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in"
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            ;(e.currentTarget as HTMLElement).querySelector('input')?.focus()
          }}
        >
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-4 w-4 text-subtle" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              aria-controls={listId}
              aria-activedescendant={visible[active] ? `${listId}-${visible[active].id}` : undefined}
              className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-subtle"
            />
            {loading && <Spinner className="h-3.5 w-3.5 text-subtle" />}
          </div>
          <ul ref={listRef} id={listId} role="listbox" className="scrollbar-thin max-h-64 overflow-y-auto p-1">
            {visible.length === 0 && !loading && <li className="px-3 py-6 text-center text-[13px] text-muted">{emptyText}</li>}
            {visible.map((item, i) => {
              const selected = item.id === value
              return (
                <li
                  key={item.id}
                  id={`${listId}-${item.id}`}
                  data-index={i}
                  role="option"
                  aria-selected={selected}
                  aria-disabled={item.disabled || undefined}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(item)}
                  className={cn(
                    'flex cursor-default items-center gap-2 rounded-md px-2 py-1.5',
                    i === active && 'bg-fg/[0.05]',
                    item.disabled && 'opacity-40',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-fg">{item.label}</div>
                    {item.sublabel && <div className="truncate text-xs text-muted">{item.sublabel}</div>}
                  </div>
                  {item.meta && <div className="shrink-0 text-xs text-muted">{item.meta}</div>}
                  <Check className={cn('h-4 w-4 shrink-0 text-accent', selected ? 'opacity-100' : 'opacity-0')} aria-hidden />
                </li>
              )
            })}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
})
