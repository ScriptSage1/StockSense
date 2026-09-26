import * as RD from '@radix-ui/react-dialog'
import { Menu, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/Button'
import { NavList, ProfileMenu } from './Sidebar'

export function MobileTopbar() {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  return (
    <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-bg/90 px-4 backdrop-blur lg:hidden">
      <Link to="/" className="focus-ring rounded-md" aria-label="StockSense home">
        <Logo />
      </Link>
      <RD.Root open={open} onOpenChange={setOpen}>
        <RD.Trigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open navigation">
            <Menu className="h-5 w-5" />
          </Button>
        </RD.Trigger>
        <RD.Portal>
          <RD.Overlay className="fixed inset-0 z-40 bg-fg/30 data-[state=closed]:animate-overlay-out data-[state=open]:animate-overlay-in" />
          <RD.Content className="fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] flex-col bg-bg shadow-lg outline-none data-[state=closed]:animate-sheet-out data-[state=open]:animate-sheet-in">
            <RD.Title className="sr-only">Navigation</RD.Title>
            <RD.Description className="sr-only">Main navigation</RD.Description>
            <div className="flex h-14 items-center justify-between px-4">
              <Logo />
              <RD.Close asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Close navigation">
                  <X className="h-4 w-4" />
                </Button>
              </RD.Close>
            </div>
            <div className="scrollbar-thin flex-1 overflow-y-auto px-3 py-2">
              <NavList onNavigate={close} />
            </div>
            <div className="border-t border-border px-3 py-3">
              <ProfileMenu onNavigate={close} />
            </div>
          </RD.Content>
        </RD.Portal>
      </RD.Root>
    </header>
  )
}
