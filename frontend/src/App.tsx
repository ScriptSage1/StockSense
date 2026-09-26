import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'framer-motion'
import { Suspense } from 'react'
import { RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'
import { ApiError } from '@/api/client'
import { FullScreenLoader } from '@/components/PageLoader'
import { TooltipProvider } from '@/components/ui/Tooltip'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { router } from '@/routes/router'

const queryClient = new QueryClient({
  queryCache: new QueryCache(),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (count, err) => {
        // Never retry client errors; retry transient failures twice.
        if (err instanceof ApiError && err.status < 500) return false
        return count < 2
      },
    },
    mutations: { retry: false },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <TooltipProvider delayDuration={300}>
          <AuthProvider>
            <Suspense fallback={<FullScreenLoader />}>
              <RouterProvider router={router} />
            </Suspense>
          </AuthProvider>
          <Toaster
            position="bottom-right"
            closeButton
            toastOptions={{
              classNames: {
                toast: 'rounded-lg border border-border bg-panel text-fg shadow-md text-[13px]',
                description: 'text-muted',
              },
            }}
          />
        </TooltipProvider>
      </MotionConfig>
    </QueryClientProvider>
  )
}
