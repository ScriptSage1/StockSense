import logoFull from '@/assets/logo-full.png'
import logoMark from '@/assets/logo-mark.png'
import { cn } from '@/lib/utils'

export function LogoMark({ className }: { className?: string }) {
  return <img src={logoMark} alt="" aria-hidden className={cn('h-8 w-8 shrink-0 object-contain', className)} />
}

/** The two-tone "stocksense" wordmark, set in type so it stays crisp at any size. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('text-[17px] font-bold lowercase leading-none tracking-[-0.03em]', className)}>
      <span className="text-[#462648]">stock</span>
      <span className="text-[#9d375e]">sense</span>
    </span>
  )
}

export function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <span className="flex items-center gap-2" aria-label="StockSense">
      <LogoMark />
      {!collapsed && <Wordmark />}
    </span>
  )
}

/** Stacked mark + wordmark, for the sign-in screens. */
export function LogoFull({ className }: { className?: string }) {
  return <img src={logoFull} alt="StockSense" className={cn('h-auto w-[168px]', className)} />
}
