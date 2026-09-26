import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

const qtyFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 })
const compactFormat = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })

export function formatQty(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return qtyFormat.format(value)
}

export function formatSigned(value: number): string {
  const s = qtyFormat.format(Math.abs(value))
  if (value > 0) return `+${s}`
  if (value < 0) return `−${s}`
  return s
}

export function formatCompact(value: number): string {
  return Math.abs(value) >= 10_000 ? compactFormat.format(value) : qtyFormat.format(value)
}

/** Parses a YYYY-MM-DD date as a local calendar date (no timezone shift). */
export function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const shortDateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDate(value: string | null | undefined, opts: { short?: boolean } = {}): string {
  if (!value) return '—'
  const d = value.length === 10 ? parseDateOnly(value) : new Date(value)
  if (opts.short && d.getFullYear() === new Date().getFullYear()) return shortDateFmt.format(d)
  return dateFmt.format(d)
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  return dateTimeFmt.format(new Date(value))
}

export function relativeTime(value: string): string {
  const diff = Date.now() - new Date(value).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return formatDate(value, { short: true })
}

export function todayIso(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${formatQty(n)} ${n === 1 ? one : many}`
}
