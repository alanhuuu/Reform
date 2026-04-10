'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useEffect } from 'react'
import { ProgressProvider, useProgress } from '@/components/dashboard/ProgressContext'
import InteractiveBackground from '@/components/landing/InteractiveBackground'
import ProjectsDrawer from '@/components/layout/ProjectsDrawer'
import AccountMenu from '@/components/layout/AccountMenu'

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
      <div className="h-[2px] w-full" style={{ background: 'rgba(255,255,255,0.03)' }}>
        <div
          className="h-full transition-all duration-700 ease-out"
          style={{
            width: `${state.progress}%`,
            background: 'linear-gradient(90deg, #7c8cff, #aab4ff)',
            boxShadow: '0 0 16px rgba(124,140,255,0.35)',
          }}
        />
      </div>
      {state.label && (
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full text-[10px] font-medium"
          style={{
            background: 'rgba(6,8,13,0.9)',
            color: 'rgba(255,255,255,0.45)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(8px)',
          }}
        >
          {state.label}
        </div>
      )}
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { status } = useSession()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace(`/signin?next=${encodeURIComponent(pathname)}`)
    }
  }, [status, pathname, router])

  if (status !== 'authenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#05070c' }}>
        <div className="w-5 h-5 rounded-full animate-spin" style={{ border: '2px solid rgba(168,85,247,0.2)', borderTopColor: '#a855f7' }} />
      </div>
    )
  }

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
    <div className="app-shell min-h-screen">
      <InteractiveBackground />
      <GlobalProgressBar />

      <header
        className="fixed top-0 left-0 right-0 z-50 border-b"
        style={{
          background: 'rgba(5,7,12,0.78)',
          backdropFilter: 'blur(20px)',
          borderColor: 'rgba(255,255,255,0.08)',
        }}
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 flex justify-between items-center gap-4">
          <div className="flex items-center gap-3 sm:gap-8 min-w-0">
            <ProjectsDrawer />
            <Link href="/" className="flex items-center gap-3 flex-shrink-0">
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center"
                style={{
                  background: 'linear-gradient(180deg, rgba(124,140,255,0.2) 0%, rgba(124,140,255,0.08) 100%)',
                  border: '1px solid rgba(170,180,255,0.16)',
                }}
              >
                <Image src="/reform_logo.png" alt="Reform" width={20} height={20} className="object-contain" />
              </div>
              <div className="hidden sm:block">
                <div className="text-[14px] font-semibold text-white" style={{ letterSpacing: '-0.03em' }}>Reform</div>
                <div className="mono text-[10px]" style={{ color: 'rgba(255,255,255,0.28)' }}>analysis workspace</div>
              </div>
            </Link>

            <nav className="hidden sm:flex items-center gap-1 rounded-2xl p-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href
                const isLocked = item.href === '/dashboard/discovery' && progressState.active
                return isLocked ? (
                  <div key={item.href} className="px-3 py-2 text-[12px] font-medium opacity-20" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {item.label}
                  </div>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="px-3 py-2 rounded-xl text-[12px] font-medium transition-all duration-150"
                    style={
                      isActive
                        ? {
                            background: 'rgba(124,140,255,0.14)',
                            color: 'white',
                            boxShadow: 'inset 0 0 0 1px rgba(170,180,255,0.12)',
                          }
                        : { color: 'rgba(255,255,255,0.38)' }
                    }
                  >
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
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
              className="btn-ghost px-3 sm:px-4 py-2 rounded-xl text-[10px] sm:text-[11px] font-medium"
            >
              New Analysis
            </button>
            <AccountMenu />
          </div>
        </div>
      </header>

      <div
        className="fixed top-[73px] left-0 right-0 z-40 sm:hidden overflow-x-auto"
        style={{
          background: 'rgba(5,7,12,0.95)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div className="flex items-center gap-2 px-3 py-2.5">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className="px-3 py-2 rounded-xl text-[11px] font-medium transition-colors whitespace-nowrap flex-shrink-0"
                style={
                  isActive
                    ? { background: 'rgba(124,140,255,0.14)', color: 'white' }
                    : { color: 'rgba(255,255,255,0.35)' }
                }
              >
                {item.label}
              </Link>
            )
          })}
        </div>
      </div>

      <main className="pt-[124px] sm:pt-[88px] min-h-screen relative" style={{ zIndex: 1 }}>
        {children}
      </main>
    </div>
  )
}
