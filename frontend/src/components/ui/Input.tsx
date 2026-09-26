import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { ChevronDown, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

export const controlClass =
  'block w-full rounded-md border border-border bg-panel px-3 text-sm text-fg shadow-xs ' +
  'placeholder:text-subtle transition-[border-color,box-shadow] duration-150 ' +
  'hover:border-border-strong focus:border-accent/60 focus:outline-none focus:ring-[3px] focus:ring-accent/15 ' +
  'disabled:cursor-not-allowed disabled:bg-surface disabled:text-muted ' +
  'aria-[invalid=true]:border-danger/60 aria-[invalid=true]:focus:ring-danger/15'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(controlClass, 'h-9', className)} {...rest} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 3, ...rest }, ref) {
    return <textarea ref={ref} rows={rows} className={cn(controlClass, 'resize-y py-2', className)} {...rest} />
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(controlClass, 'h-9 appearance-none pr-8', className)} {...rest}>
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
        aria-hidden
      />
    </div>
  )
})

export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>>(
  function PasswordInput({ className, ...rest }, ref) {
    const [visible, setVisible] = useState(false)
    return (
      <div className="relative">
        <Input ref={ref} type={visible ? 'text' : 'password'} className={cn('pr-10', className)} {...rest} />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="focus-ring absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-subtle hover:text-fg"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    )
  },
)

export function Label({ htmlFor, children, className }: { htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn('mb-1.5 block text-[13px] font-medium text-fg', className)}>
      {children}
    </label>
  )
}

interface FieldProps {
  label?: ReactNode
  hint?: ReactNode
  error?: string
  className?: string
  labelAction?: ReactNode
  /** A single form control; receives id / aria-invalid / aria-describedby automatically. */
  children: ReactElement
}

export function Field({ label, hint, error, className, labelAction, children }: FieldProps) {
  const autoId = useId()
  const id = (isValidElement(children) && (children.props as { id?: string }).id) || autoId
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className={className}>
      {label && (
        <div className="flex items-center justify-between">
          <Label htmlFor={id}>{label}</Label>
          {labelAction && <div className="mb-1.5">{labelAction}</div>}
        </div>
      )}
      {cloneElement(children as ReactElement<Record<string, unknown>>, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-[12.5px] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[12.5px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
