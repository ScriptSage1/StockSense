/**
 * In-memory access-token store.
 *
 * The access token lives ONLY in this module's closure: never in localStorage, sessionStorage,
 * IndexedDB, cookies or the URL. A page reload drops it; the app then restores the session via
 * the httpOnly refresh cookie (POST /auth/refresh).
 */

type Listener = () => void

let accessToken: string | null = null
const expiredListeners = new Set<Listener>()

export const tokenStore = {
  get(): string | null {
    return accessToken
  },
  set(token: string | null): void {
    accessToken = token
  },
  clear(): void {
    accessToken = null
  },
  /** Subscribe to "session could not be refreshed" events. Returns an unsubscribe fn. */
  onExpired(listener: Listener): () => void {
    expiredListeners.add(listener)
    return () => expiredListeners.delete(listener)
  },
  notifyExpired(): void {
    accessToken = null
    expiredListeners.forEach((l) => l())
  },
}
