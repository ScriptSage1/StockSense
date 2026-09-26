import * as DM from '@radix-ui/react-dropdown-menu'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export const DropdownMenu = DM.Root
export const DropdownTrigger = DM.Trigger

export function DropdownContent({
  children,
  align = 'end',
  side = 'bottom',
  className,
}: {
  children: ReactNode
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        side={side}
        sideOffset={6}
        className={cn(
          'z-50 min-w-[200px] rounded-lg border border-border bg-panel p-1 shadow-md outline-none',
          'data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in',
          className,
        )}
      >
        {children}
      </DM.Content>
    </DM.Portal>
  )
}

export function DropdownItem({
  children,
  icon,
  onSelect,
  tone,
}: {
  children: ReactNode
  icon?: ReactNode
  onSelect?: () => void
  tone?: 'danger'
}) {
  return (
    <DM.Item
      onSelect={onSelect}
      className={cn(
        'flex h-8 cursor-default select-none items-center gap-2 rounded-md px-2 text-[13px] outline-none',
        'data-[highlighted]:bg-fg/[0.05]',
        tone === 'danger' ? 'text-danger' : 'text-fg',
      )}
    >
      {icon && <span className="text-muted [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      {children}
    </DM.Item>
  )
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return <DM.Label className="px-2 pb-1 pt-1.5 text-xs text-muted">{children}</DM.Label>
}

export function DropdownSeparator() {
  return <DM.Separator className="my-1 h-px bg-border" />
}
