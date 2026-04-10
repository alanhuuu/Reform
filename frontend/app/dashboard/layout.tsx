'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { ProgressProvider, useProgress } from '@/components/dashboard/ProgressContext'
import ProjectsDrawer from '@/components/layout/ProjectsDrawer'

const NAV_ITEMS = [
  { href: '/dashboard/discovery', label: 'Project Discovery' },
  { href: '/dashboard/transform', label: 'UI Transformation' },
  { href: '/dashboard/simulation', label: 'UX Analysis' },
]

function GlobalProgressBar() {
  const { state } = useProgress()
  const pathname = usePathname()
  if (!state.active || pathname === '/dashboard/discovery') return null
  return (
    <div className="fixed top-0 left-0 right-0 z-[100]">
      <div className="h-[2px] w-full" style={{ background: 'rgba(255,255,255,0.04)' }}>
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{ width: `${state.progress}%`, background: '#8B5CF6' }}
        />
      </div>
      {state.label && (
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-md text-[10px] font-medium"
          style={{ background: '#141414', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {state.label}
        </div>
      )}
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProgressProvider>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </ProgressProvider>
  )
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { state: progressState } = useProgress()

  return (
    <div className="min-h-screen" style={{ background: '#0A0A0A' }}>
      <GlobalProgressBar />

      {/* Navbar — flat, minimal, border-bottom only */}
      <header
        className="fixed top-0 left-0 right-0 z-50"
        style={{ background: '#0A0A0A', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex justify-between items-center gap-4">
          <div className="flex items-center gap-4 sm:gap-6 min-w-0">
            <ProjectsDrawer />
            <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.15)' }}>
                <Image src="/reform_logo.png" alt="Reform" width={16} height={16} className="object-contain" />
              </div>
              <span className="hidden sm:block text-[14px] font-semibold text-white tracking-tight">Reform</span>
            </Link>

            <nav className="hidden sm:flex items-center gap-1">
              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href
                const isLocked = item.href === '/dashboard/discovery' && progressState.active
                return isLocked ? (
                  <div key={item.href} className="px-3 py-1.5 text-[12px] font-medium" style={{ color: 'rgba(255,255,255,0.2)' }}>
                    {item.label}
                  </div>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors duration-150"
                    style={isActive
                      ? { background: 'rgba(255,255,255,0.06)', color: 'white' }
                      : { color: 'rgba(255,255,255,0.4)' }
                    }
                  >
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </div>

          <button
            onClick={() => {
              sessionStorage.removeItem('refineui_analysis')
              sessionStorage.removeItem('refineui_discovery')
              sessionStorage.removeItem('refineui_answers')
              sessionStorage.removeItem('refineui_analysis_cache')
              sessionStorage.removeItem('refineui_transform')
              sessionStorage.removeItem('refineui_repo')
              window.location.href = '/dashboard/discovery'
            }}
            className="px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors duration-150"
            style={{ color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            New Analysis
          </button>
        </div>
      </header>

      {/* Mobile nav */}
      <div
        className="fixed top-14 left-0 right-0 z-40 sm:hidden overflow-x-auto"
        style={{ background: '#0A0A0A', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="flex items-center gap-1 px-4 py-2">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className="px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap flex-shrink-0"
                style={isActive
                  ? { background: 'rgba(255,255,255,0.06)', color: 'white' }
                  : { color: 'rgba(255,255,255,0.35)' }
                }
              >
                {item.label}
              </Link>
            )
          })}
        </div>
      </div>

      <main className="pt-[104px] sm:pt-[72px] min-h-screen relative" style={{ zIndex: 1 }}>
        {children}
      </main>
    </div>
  )
}
