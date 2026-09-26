import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { ApiError, NetworkError } from '@/api/client'

const CODE_MESSAGES: Record<string, string> = {
  DUPLICATE_SKU: 'That SKU is already in use.',
  ALREADY_VALIDATED: 'This operation has already been validated.',
  ALREADY_CANCELED: 'This operation is already canceled.',
  OPERATION_CANCELED: 'Canceled operations cannot be validated.',
  OPERATION_LOCKED: 'Only draft operations can be edited.',
  OTP_EXPIRED: 'That code has expired. Request a new one.',
  OTP_MAX_ATTEMPTS: 'Too many incorrect attempts. Request a new code.',
  RESET_TOKEN_INVALID: 'This reset session is no longer valid. Start again.',
  MANAGER_REQUIRED: 'Manager access is required for this action.',
  RATE_LIMITED: 'Too many attempts. Try again in a few minutes.',
  REFRESH_INVALID: 'Your session has ended. Sign in again.',
  INTERNAL_ERROR: 'Something failed on the server. Try again shortly.',
}

const STATUS_MESSAGES: Record<number, string> = {
  400: 'The request could not be completed.',
  401: 'Your session has ended. Sign in again.',
  403: "You don't have permission to do that.",
  404: 'Not found. It may have been removed.',
  409: 'This conflicts with the current state. Refresh and try again.',
  422: 'Some values are invalid.',
  429: 'Too many attempts. Try again in a few minutes.',
  500: 'Something failed on the server. Try again shortly.',
}

/** Human-readable message for any thrown value. Prefers the server's specific detail. */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (err instanceof NetworkError) return err.message
  if (err instanceof ApiError) {
    // Server details are written for users (e.g. INSUFFICIENT_STOCK names the product & quantities).
    if (err.code === 'INSUFFICIENT_STOCK' || err.code === 'OTP_INVALID') return err.body.detail
    if (CODE_MESSAGES[err.code]) return CODE_MESSAGES[err.code]
    if (err.status >= 500) return STATUS_MESSAGES[500]
    if (err.body.detail && err.body.detail !== 'Request failed') return err.body.detail
    return STATUS_MESSAGES[err.status] ?? fallback
  }
  return fallback
}

export function isApiError(err: unknown, code?: string): err is ApiError {
  return err instanceof ApiError && (code === undefined || err.code === code)
}

/**
 * Maps server field errors (`field` / `errors[]`, e.g. "lines[1].quantity") onto react-hook-form
 * fields. Returns true when at least one field error was applied.
 */
export function applyFieldErrors<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
  map: (serverField: string) => string | null = (f) => f,
): boolean {
  if (!(err instanceof ApiError)) return false
  const entries: { field: string | null; detail: string }[] = err.body.errors?.length
    ? err.body.errors
    : [{ field: err.field, detail: errorMessage(err) }]
  let applied = false
  for (const e of entries) {
    if (!e.field) continue
    const normalised = e.field.replace(/\[(\d+)\]/g, '.$1')
    const target = map(normalised)
    if (!target) continue
    setError(target as Path<T>, { type: 'server', message: e.detail })
    applied = true
  }
  return applied
}
