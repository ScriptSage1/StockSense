import { cn } from '@/lib/utils'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('h-7 w-7', className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#612D53" />
      <path d="M9 12.5 16 8.5l7 4v7l-7 4-7-4z" fill="none" stroke="#F3F4F4" strokeWidth="2" strokeLinejoin="round" />
      <path d="M9 12.5l7 4 7-4M16 16.5v7" fill="none" stroke="#F3F4F4" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

export function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      {!collapsed && <span className="text-[15px] font-semibold tracking-[-0.02em] text-fg">StockSense</span>}
    </span>
  )
}
