import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { refreshSession } from '@/api/client'
import { authApi } from '@/api/endpoints'
import { tokenStore } from '@/lib/auth-store'
import type { TokenResponse, User } from '@/types/api'

type Status = 'loading' | 'authenticated' | 'anonymous'

interface AuthContextValue {
  status: Status
  user: User | null
  isManager: boolean
  /** True when the last session ended because refresh failed (vs. explicit logout). */
  sessionExpired: boolean
  login: (email: string, password: string) => Promise<User>
  register: (fullName: string, email: string, password: string) => Promise<User>
  logout: () => Promise<void>
  setUser: (user: User) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [status, setStatus] = useState<Status>('loading')
  const [user, setUserState] = useState<User | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)

  const accept = useCallback((res: TokenResponse) => {
    tokenStore.set(res.access_token)
    setUserState(res.user)
    setSessionExpired(false)
    setStatus('authenticated')
    return res.user
  }, [])

  // Restore the session on page load via the httpOnly refresh cookie.
  useEffect(() => {
    let active = true
    refreshSession().then((res) => {
      if (!active) return
      if (res) accept(res)
      else setStatus('anonymous')
    })
    return () => {
      active = false
    }
  }, [accept])

  // When a request cannot refresh an expired token, drop to the login screen.
  useEffect(
    () =>
      tokenStore.onExpired(() => {
        setUserState(null)
        setSessionExpired(true)
        setStatus('anonymous')
        qc.clear()
      }),
    [qc],
  )

  const login = useCallback(
    async (email: string, password: string) => accept(await authApi.login(email, password)),
    [accept],
  )

  const register = useCallback(
    async (fullName: string, email: string, password: string) =>
      accept(await authApi.register(fullName, email, password)),
    [accept],
  )

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } catch {
      // The server session may already be gone; local sign-out still proceeds.
    }
    tokenStore.clear()
    setUserState(null)
    setSessionExpired(false)
    setStatus('anonymous')
    qc.clear()
  }, [qc])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      isManager: user?.role === 'manager',
      sessionExpired,
      login,
      register,
      logout,
      setUser: setUserState,
    }),
    [status, user, sessionExpired, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
