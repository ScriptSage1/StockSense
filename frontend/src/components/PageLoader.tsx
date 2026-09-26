import { Skeleton } from '@/components/ui/Skeleton'

export function PageLoader() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading page">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-56" />
      </div>
      <Skeleton className="h-10 w-full max-w-md" />
      <div className="space-y-3 rounded-lg border border-border p-5">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    </div>
  )
}

export function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col items-center gap-3">
        <svg viewBox="0 0 32 32" className="h-9 w-9 animate-pulse" aria-hidden>
          <rect width="32" height="32" rx="8" fill="#612D53" />
          <path d="M9 12.5 16 8.5l7 4v7l-7 4-7-4z" fill="none" stroke="#F3F4F4" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  )
}
