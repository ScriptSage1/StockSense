import { describe, expect, it } from 'vitest'
import { ApiError, NetworkError } from '@/api/client'
import { errorMessage } from './errors'

const apiErr = (status: number, code: string, detail = 'Server detail') => new ApiError(status, { detail, code })

describe('errorMessage', () => {
  it('keeps specific server detail for insufficient stock', () => {
    expect(errorMessage(apiErr(422, 'INSUFFICIENT_STOCK', 'Insufficient stock for DESK001: 4 available, 6 requested'))).toBe(
      'Insufficient stock for DESK001: 4 available, 6 requested',
    )
  })

  it('maps known codes to concise copy', () => {
    expect(errorMessage(apiErr(409, 'DUPLICATE_SKU'))).toBe('That SKU is already in use.')
    expect(errorMessage(apiErr(409, 'ALREADY_VALIDATED'))).toBe('This operation has already been validated.')
    expect(errorMessage(apiErr(400, 'OTP_EXPIRED'))).toMatch(/expired/)
    expect(errorMessage(apiErr(429, 'OTP_MAX_ATTEMPTS'))).toMatch(/Too many/)
  })

  it('never leaks raw 500 details', () => {
    expect(errorMessage(apiErr(500, 'SOMETHING', 'Traceback (most recent call last)'))).not.toMatch(/Traceback/)
  })

  it('explains network failures', () => {
    expect(errorMessage(new NetworkError())).toMatch(/reach the server/)
  })
})
