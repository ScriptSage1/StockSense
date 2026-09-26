import * as RD from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }

export function Dialog({ open, onOpenChange, title, description, children, footer, size = 'md' }: DialogProps) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay className="fixed inset-0 z-50 bg-fg/30 backdrop-blur-[1px] data-[state=closed]:animate-overlay-out data-[state=open]:animate-overlay-in" />
        <RD.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[min(90vh,720px)] w-[calc(100vw-2rem)] flex-col rounded-xl border border-border bg-panel shadow-lg outline-none',
            'data-[state=closed]:animate-dialog-out data-[state=open]:animate-dialog-in',
            widths[size],
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <RD.Title className="text-[15px] font-semibold text-fg">{title}</RD.Title>
              {description ? (
                <RD.Description className="mt-0.5 text-[13px] text-muted">{description}</RD.Description>
              ) : (
                <RD.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</RD.Description>
              )}
            </div>
            <RD.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close" className="-mr-1.5 -mt-1">
                <X className="h-4 w-4" />
              </Button>
            </RD.Close>
          </div>
          {children && <div className="scrollbar-thin overflow-y-auto px-5 py-4">{children}</div>}
          {footer && (
            <div className="flex flex-col-reverse gap-2 border-t border-border bg-surface/60 px-5 py-3 sm:flex-row sm:justify-end">
              {footer}
            </div>
          )}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  )
}

interface ConfirmProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  confirmLabel: string
  tone?: 'danger' | 'primary'
  loading?: boolean
  onConfirm: () => void
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = 'primary',
  loading,
  onConfirm,
}: ConfirmProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !loading && onOpenChange(o)}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={loading}>
            Keep
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  )
}
