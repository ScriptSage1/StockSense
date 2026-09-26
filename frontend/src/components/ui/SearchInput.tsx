import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { controlClass } from './Input'

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search',
  className,
  label = 'Search',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  label?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className={cn(controlClass, 'h-9 pl-8 pr-8 [&::-webkit-search-cancel-button]:hidden')}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="focus-ring absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-subtle hover:text-fg"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
