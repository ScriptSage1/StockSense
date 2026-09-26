import { motion, useReducedMotion } from 'framer-motion'
import { Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { PageLoader } from '@/components/PageLoader'
import { MobileTopbar } from './MobileNav'
import { Sidebar } from './Sidebar'

const COLLAPSE_KEY = 'ss.sidebar.collapsed' // UI preference only — never auth data

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

export function AppShell() {
  const location = useLocation()
  const reduce = useReducedMotion()
  const [collapsed, setCollapsed] = useState(readCollapsed)

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
    } catch {
      /* storage unavailable: preference is not persisted */
    }
  }, [collapsed])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  return (
    <div className="flex min-h-screen bg-bg">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-panel px-3 py-2 shadow-md focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopbar />
        <main id="main" className="flex-1 lg:py-2 lg:pr-2">
          <div className="print-full min-h-[calc(100vh-1rem)] bg-canvas lg:rounded-xl lg:border lg:border-border lg:shadow-xs">
            <motion.div
              key={location.pathname}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8"
            >
              <Suspense fallback={<PageLoader />}>
                <Outlet />
              </Suspense>
            </motion.div>
          </div>
        </main>
      </div>
    </div>
  )
}
