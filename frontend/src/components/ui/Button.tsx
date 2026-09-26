import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle'
type Size = 'sm' | 'md' | 'icon' | 'icon-sm'

const base =
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium ' +
  'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-1 ' +
  'disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-white shadow-xs hover:bg-accent-hover',
  secondary: 'border border-border bg-panel text-fg shadow-xs hover:border-border-strong hover:bg-surface',
  ghost: 'text-muted hover:bg-fg/[0.05] hover:text-fg',
  subtle: 'bg-accent-soft text-accent hover:bg-accent/10',
  danger: 'bg-danger text-white shadow-xs hover:bg-danger/90',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-9 px-3.5 text-sm',
  icon: 'h-9 w-9',
  'icon-sm': 'h-8 w-8',
}

export function buttonClass(variant: Variant = 'secondary', size: Size = 'md', className?: string): string {
  return cn(base, variants[variant], sizes[size], className)
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner className="h-3.5 w-3.5" label="Working" /> : icon}
      {children}
    </button>
  )
})

export interface ButtonLinkProps extends LinkProps {
  variant?: Variant
  size?: Size
  icon?: ReactNode
}

export function ButtonLink({ variant = 'secondary', size = 'md', icon, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClass(variant, size, typeof className === 'string' ? className : undefined)} {...rest}>
      {icon}
      {children}
    </Link>
  )
}
