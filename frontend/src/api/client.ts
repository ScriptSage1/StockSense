import { tokenStore } from '@/lib/auth-store'
import type { ApiErrorBody, TokenResponse } from '@/types/api'

const BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000').replace(/\/$/, '')
export const API_PREFIX = `${BASE}/api/v1`

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly field: string | null
  readonly body: ApiErrorBody

  constructor(status: number, body: ApiErrorBody) {
    super(body.detail)
    this.name = 'ApiError'
    this.status = status
    this.code = body.code
    this.field = body.field ?? null
    this.body = body
  }
}

export class NetworkError extends Error {
  constructor() {
    super("Can't reach the server. Check your connection and try again.")
    this.name = 'NetworkError'
  }
}

type Query = Record<string, string | number | boolean | null | undefined>

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Query
  /** Attach the bearer token and transparently refresh on 401. Default true. */
  auth?: boolean
  signal?: AbortSignal
}

function buildUrl(path: string, query?: Query): string {
  const url = `${API_PREFIX}${path}`
  if (!query) return url
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue
    params.set(k, String(v))
  }
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

async function parseError(res: Response): Promise<ApiError> {
  let body: ApiErrorBody
  try {
    const json = (await res.json()) as Partial<ApiErrorBody>
    body = {
      ...json,
      detail: typeof json.detail === 'string' ? json.detail : 'Request failed',
      code: json.code ?? `HTTP_${res.status}`,
    }
  } catch {
    body = { detail: res.statusText || 'Request failed', code: `HTTP_${res.status}` }
  }
  return new ApiError(res.status, body)
}

async function rawFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { credentials: 'include', ...init })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new NetworkError()
  }
}

// ------------------------------------------------------------------ refresh (single-flight)
let refreshInFlight: Promise<TokenResponse | null> | null = null

/**
 * Exchange the httpOnly refresh cookie for a new access token. Concurrent callers share one
 * request (important on reload, in React StrictMode, and when several queries 401 at once).
 * Resolves null when the session cannot be restored.
 */
export function refreshSession(): Promise<TokenResponse | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await rawFetch(buildUrl('/auth/refresh'), {
          method: 'POST',
          headers: { Accept: 'application/json' },
        })
        if (!res.ok) return null
        const data = (await res.json()) as TokenResponse
        tokenStore.set(data.access_token)
        return data
      } catch {
        return null
      } finally {
        // Allow a new refresh on the next tick, after all current awaiters resolved.
        setTimeout(() => {
          refreshInFlight = null
        }, 0)
      }
    })()
  }
  return refreshInFlight
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, auth = true, signal } = opts
  const url = buildUrl(path, query)

  const send = () => {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const token = tokenStore.get()
    if (auth && token) headers.Authorization = `Bearer ${token}`
    return rawFetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    })
  }

  let res = await send()

  if (res.status === 401 && auth) {
    const refreshed = await refreshSession()
    if (refreshed) {
      res = await send()
    } else {
      tokenStore.notifyExpired()
      throw await parseError(res)
    }
    if (res.status === 401) {
      tokenStore.notifyExpired()
    }
  }

  if (!res.ok) throw await parseError(res)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown, opts: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    request<T>(path, { ...opts, method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
