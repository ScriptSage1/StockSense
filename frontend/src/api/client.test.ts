import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api, refreshSession } from '@/api/client'
import { tokenStore } from '@/lib/auth-store'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const tokenBody = (token: string) => ({
  access_token: token,
  token_type: 'bearer',
  expires_in: 1800,
  user: { id: 'u1', full_name: 'A B', email: 'a@b.dev', role: 'staff', is_active: true, created_at: '' },
})

describe('api client auth handling', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    tokenStore.clear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('attaches the in-memory bearer token and sends cookies', async () => {
    tokenStore.set('tok-1')
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }))
    await api.get('/users/me')
    const [, init] = fetchMock.mock.calls[0]
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok-1')
    expect(init?.credentials).toBe('include')
  })

  it('refreshes once on 401 and retries the original request', async () => {
    tokenStore.set('expired')
    fetchMock
      .mockResolvedValueOnce(json(401, { detail: 'Token is invalid or expired', code: 'TOKEN_EXPIRED' }))
      .mockResolvedValueOnce(json(200, tokenBody('fresh')))
      .mockResolvedValueOnce(json(200, { id: 'p1' }))
    const result = await api.get<{ id: string }>('/products/p1')
    expect(result.id).toBe('p1')
    expect(fetchMock.mock.calls[1][0]).toContain('/auth/refresh')
    const retryHeaders = fetchMock.mock.calls[2][1]?.headers as Record<string, string>
    expect(retryHeaders.Authorization).toBe('Bearer fresh')
    expect(tokenStore.get()).toBe('fresh')
  })

  it('shares one refresh request between concurrent callers', async () => {
    fetchMock.mockResolvedValue(json(200, tokenBody('shared')))
    const [a, b] = await Promise.all([refreshSession(), refreshSession()])
    expect(a?.access_token).toBe('shared')
    expect(b?.access_token).toBe('shared')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('signals session expiry when refresh fails', async () => {
    const onExpired = vi.fn()
    const unsubscribe = tokenStore.onExpired(onExpired)
    tokenStore.set('expired')
    fetchMock
      .mockResolvedValueOnce(json(401, { detail: 'expired', code: 'TOKEN_EXPIRED' }))
      .mockResolvedValueOnce(json(401, { detail: 'Session expired', code: 'REFRESH_INVALID' }))
    await expect(api.get('/dashboard/summary')).rejects.toBeInstanceOf(ApiError)
    expect(onExpired).toHaveBeenCalledTimes(1)
    expect(tokenStore.get()).toBeNull()
    unsubscribe()
  })

  it('surfaces structured API errors', async () => {
    tokenStore.set('t')
    fetchMock.mockResolvedValueOnce(
      json(422, { detail: 'Insufficient stock for DESK001', code: 'INSUFFICIENT_STOCK', field: 'lines[0].quantity', shortages: [] }),
    )
    const err = await api.post('/operations/x/validate').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).code).toBe('INSUFFICIENT_STOCK')
    expect((err as ApiError).field).toBe('lines[0].quantity')
  })

  it('never persists the access token to web storage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    fetchMock.mockResolvedValueOnce(json(200, tokenBody('secret-token')))
    await refreshSession()
    expect(setItem).not.toHaveBeenCalled()
    expect(document.cookie).not.toContain('secret-token')
    setItem.mockRestore()
  })
})
