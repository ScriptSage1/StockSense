import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { refreshSession } from '@/api/client'
import { authApi } from '@/api/endpoints'
import { tokenStore } from '@/lib/auth-store'
import type { Challenge, TokenResponse, User } from '@/types/api'

type Status = 'loading' | 'authenticated' | 'anonymous'

interface AuthContextValue {
  status: Status
  user: User | null
  isManager: boolean
  /** True when the last session ended because refresh failed (vs. explicit logout). */
  sessionExpired: boolean
  /** Step 1 of sign-in: checks the password; a code is emailed. */
  login: (email: string, password: string) => Promise<Challenge>
  /** Step 1 of sign-up: a code is emailed to confirm the address. */
  register: (fullName: string, email: string, password: string) => Promise<Challenge>
  /** Step 2: accept the session returned by verifying the emailed code. */
  completeSignIn: (session: TokenResponse) => User
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

  const login = useCallback((email: string, password: string) => authApi.login(email, password), [])

  const register = useCallback(
    (fullName: string, email: string, password: string) => authApi.register(fullName, email, password),
    [],
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
      completeSignIn: accept,
      logout,
      setUser: setUserState,
    }),
    [status, user, sessionExpired, login, register, accept, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
