import * as TT from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'

export const TooltipProvider = TT.Provider

export function Tooltip({
  content,
  children,
  side = 'top',
  disabled,
}: {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  disabled?: boolean
}) {
  if (disabled) return <>{children}</>
  return (
    <TT.Root>
      <TT.Trigger asChild>{children}</TT.Trigger>
      <TT.Portal>
        <TT.Content
          side={side}
          sideOffset={6}
          className="z-50 rounded-md bg-fg px-2 py-1 text-xs font-medium text-white shadow-md data-[state=closed]:animate-pop-out data-[state=delayed-open]:animate-pop-in"
        >
          {content}
        </TT.Content>
      </TT.Portal>
    </TT.Root>
  )
}
