import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

/** Six single-digit inputs with auto-advance, backspace navigation and paste support. */
export function OtpInput({
  value,
  onChange,
  invalid,
  success,
  disabled,
  onComplete,
}: {
  value: string
  onChange: (value: string) => void
  invalid?: boolean
  /** Verified: the boxes turn green one after another. */
  success?: boolean
  disabled?: boolean
  onComplete?: (value: string) => void
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const digits = Array.from({ length: 6 }, (_, i) => (value[i] ?? '').trim())
  // Empty slots are kept as spaces so digits never shift position.
  const encode = (list: string[]) => list.map((d) => d || ' ').join('').replace(/\s+$/, '')

  const setAt = (index: number, digit: string) => {
    const next = digits.slice()
    next[index] = digit
    const joined = encode(next)
    onChange(joined)
    if (digit && index < 5) refs.current[index + 1]?.focus()
    if (next.every(Boolean)) onComplete?.(next.join(''))
  }

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      refs.current[i - 1]?.focus()
      const next = digits.slice()
      next[i - 1] = ''
      onChange(encode(next))
      e.preventDefault()
    } else if (e.key === 'ArrowLeft' && i > 0) {
      refs.current[i - 1]?.focus()
    } else if (e.key === 'ArrowRight' && i < 5) {
      refs.current[i + 1]?.focus()
    }
  }

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    e.preventDefault()
    onChange(pasted)
    refs.current[Math.min(pasted.length, 5)]?.focus()
    if (pasted.length === 6) onComplete?.(pasted)
  }

  return (
    <div className="flex justify-between gap-2" role="group" aria-label="6-digit code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          value={d}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          aria-label={`Digit ${i + 1}`}
          aria-invalid={invalid || undefined}
          data-filled={Boolean(d)}
          style={success ? { transitionDelay: `${i * 45}ms` } : undefined}
          autoFocus={i === 0}
          onPaste={onPaste}
          onKeyDown={(e) => onKeyDown(i, e)}
          onChange={(e) => setAt(i, e.target.value.replace(/\D/g, '').slice(-1))}
          className={cn(
            'tabular h-12 w-full min-w-0 rounded-md border bg-panel text-center text-lg font-semibold text-fg shadow-xs',
            'transition-[border-color,box-shadow,background-color,color] duration-200',
            'focus:border-accent/60 focus:outline-none focus:ring-[3px] focus:ring-accent/15',
            'data-[filled=true]:animate-digit-pop',
            success
              ? 'border-success/50 bg-success-soft text-success'
              : invalid
                ? 'border-danger/60'
                : 'border-border data-[filled=true]:border-accent/35',
          )}
        />
      ))}
    </div>
  )
}
