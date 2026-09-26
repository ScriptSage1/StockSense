import { ShieldAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { FullScreenLoader } from '@/components/PageLoader'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAuth } from '@/features/auth/AuthProvider'

export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullScreenLoader />
  if (status === 'anonymous') {
    const next = location.pathname + location.search
    return <Navigate to={next && next !== '/' ? `/login?next=${encodeURIComponent(next)}` : '/login'} replace />
  }
  return <Outlet />
}

export function RequireGuest() {
  const { status } = useAuth()
  const [params] = useSearchParams()
  if (status === 'loading') return <FullScreenLoader />
  // After sign-in, continue to the page that required authentication.
  if (status === 'authenticated') return <Navigate to={safeNext(params.get('next'))} replace />
  return <Outlet />
}

export function RequireManager({ children }: { children?: ReactNode }) {
  const { isManager } = useAuth()
  if (!isManager) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Manager access required"
        description="Ask a manager if you need access to this page."
        action={<ButtonLink to="/">Back to dashboard</ButtonLink>}
      />
    )
  }
  return children ? <>{children}</> : <Outlet />
}

/** Only allow same-app relative redirects after login (prevents open redirects). */
export function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/'
  return raw
}
