'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ProgressProvider, useProgress } from '@/components/dashboard/ProgressContext'
import AccountMenu from '@/components/layout/AccountMenu'
import { Spinner, StatusDot } from '@/components/ui'
import { clearSelectedRepo } from '@/lib/selectedRepo'

interface NavItem {
  href: string
  label: string
  icon: (active: boolean) => React.ReactNode
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/dashboard/discovery',
    label: 'Discovery',
    icon: (active) => (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={active ? '#E5E7EB' : '#9CA3AF'} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  },
  {
    href: '/dashboard/simulation',
    label: 'Analysis',
    icon: (active) => (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={active ? '#E5E7EB' : '#9CA3AF'} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    href: '/dashboard/transform',
    label: 'Transform',
    icon: (active) => (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={active ? '#E5E7EB' : '#9CA3AF'} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 3 21 3 21 8" />
        <line x1="4" y1="20" x2="21" y2="3" />
        <polyline points="21 16 21 21 16 21" />
        <line x1="15" y1="15" x2="21" y2="21" />
        <line x1="4" y1="4" x2="9" y2="9" />
      </svg>
    ),
  },
  {
    href: '/dashboard/edit-lab',
    label: 'The Lab',
    icon: (active) => (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={active ? '#E5E7EB' : '#9CA3AF'} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
]

function ProgressStripe() {
  const { state } = useProgress()
  const pathname = usePathname()
  if (!state.active || pathname === '/dashboard/discovery') return null
  return (
    <div className="fixed top-0 left-0 right-0 z-[100] pointer-events-none">
      <div className="h-[2px] w-full" style={{ background: '#0A0A0A' }}>
        <div
          className="h-full transition-[width] duration-500 ease-out"
          style={{
            width: `${state.progress}%`,
            background: '#10B981',
            boxShadow: '0 0 12px rgba(16,185,129,0.5)',
          }}
        />
      </div>
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
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: '#0D0D0D' }}
      >
        <Spinner size={18} />
      </div>
    )
  }

  return (
    <ProgressProvider>
      <DashboardShell>{children}</DashboardShell>
    </ProgressProvider>
  )
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { state: progressState } = useProgress()

  return (
    <div className="min-h-screen" style={{ background: '#0D0D0D' }}>
      <ProgressStripe />

      {/* ── Sidebar ── */}
      <aside
        className="fixed left-0 top-0 bottom-0 z-40 hidden md:flex flex-col"
        style={{
          width: 'var(--ui-sidebar-w, 240px)',
          background: '#0A0A0A',
          borderRight: '1px solid #1A1A1A',
        }}
      >
        {/* Brand */}
        <div className="px-4 h-[52px] flex items-center gap-2.5" style={{ borderBottom: '1px solid #161616' }}>
          <Link href="/" className="flex items-center gap-2.5 group">
            <div
              className="w-6 h-6 rounded-[6px] flex items-center justify-center flex-shrink-0"
              style={{
                background: '#161616',
                border: '1px solid #262626',
              }}
            >
              <Image src="/reform_logo.png" alt="Reform" width={14} height={14} className="object-contain opacity-90" />
            </div>
            <span
              className="text-[13px] font-semibold"
              style={{ color: '#E5E7EB', letterSpacing: '-0.01em' }}
            >
              Reform
            </span>
          </Link>
          <div className="ml-auto">
            <StatusDot kind="live" size={5} />
          </div>
        </div>

        {/* Workspace context */}
        <div className="px-3 pt-3 pb-2">
          <div
            className="text-[10px] font-medium uppercase tracking-[0.1em] px-2 mb-1.5"
            style={{ color: '#6B7280' }}
          >
            Workspace
          </div>
          <div
            className="flex items-center gap-2 px-2 py-1.5 rounded-[7px] transition-colors"
            style={{ background: '#111111', border: '1px solid #1F1F1F' }}
          >
            <div
              className="w-5 h-5 rounded-[5px] flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, #10B981 0%, #065F46 100%)',
              }}
            />
            <div className="min-w-0 flex-1">
              <div
                className="text-[12px] font-medium truncate"
                style={{ color: '#E5E7EB', letterSpacing: '-0.01em' }}
              >
                Personal
              </div>
            </div>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 pt-3">
          <div
            className="text-[10px] font-medium uppercase tracking-[0.1em] px-2 mb-1.5"
            style={{ color: '#6B7280' }}
          >
            Product
          </div>
          <div className="flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href
              const isLocked =
                item.href === '/dashboard/discovery' && progressState.active && !isActive
              return (
                <Link
                  key={item.href}
                  href={isLocked ? '#' : item.href}
                  onClick={(e) => isLocked && e.preventDefault()}
                  className={`group relative flex items-center gap-2.5 h-8 px-2 rounded-[7px] transition-colors duration-150 ${
                    isLocked ? 'opacity-25 pointer-events-none' : ''
                  }`}
                  style={{
                    background: isActive ? '#161616' : 'transparent',
                    border: isActive ? '1px solid #262626' : '1px solid transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive && !isLocked) e.currentTarget.style.background = '#121212'
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive && !isLocked) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  {isActive && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-full"
                      style={{ background: '#10B981', boxShadow: '0 0 8px rgba(16,185,129,0.6)' }}
                    />
                  )}
                  <span className="flex-shrink-0">{item.icon(isActive)}</span>
                  <span
                    className="text-[12.5px] font-medium"
                    style={{
                      color: isActive ? '#E5E7EB' : '#9CA3AF',
                      letterSpacing: '-0.005em',
                    }}
                  >
                    {item.label}
                  </span>
                </Link>
              )
            })}
          </div>
        </nav>

        {/* Bottom */}
        <div className="px-3 pb-3 pt-3" style={{ borderTop: '1px solid #161616' }}>
          <button
            onClick={() => {
              sessionStorage.removeItem('refineui_analysis')
              sessionStorage.removeItem('refineui_discovery')
              sessionStorage.removeItem('refineui_answers')
              sessionStorage.removeItem('refineui_analysis_cache')
              sessionStorage.removeItem('refineui_transform')
              sessionStorage.removeItem('refineui_site_url')
              clearSelectedRepo()
              window.location.href = '/dashboard/discovery'
            }}
            className="w-full h-8 flex items-center justify-center gap-1.5 rounded-[7px] text-[12px] font-medium transition-colors duration-150"
            style={{
              color: '#9CA3AF',
              background: '#111111',
              border: '1px solid #1F1F1F',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#161616'
              e.currentTarget.style.borderColor = '#262626'
              e.currentTarget.style.color = '#E5E7EB'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#111111'
              e.currentTarget.style.borderColor = '#1F1F1F'
              e.currentTarget.style.color = '#9CA3AF'
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New analysis
          </button>
          <div className="mt-2 pt-2 flex items-center justify-between" style={{ borderTop: '1px solid #161616' }}>
            <AccountMenu />
          </div>
        </div>
      </aside>

      {/* ── Mobile top nav ── */}
      <header
        className="fixed top-0 left-0 right-0 z-40 md:hidden flex items-center justify-between h-[52px] px-4"
        style={{
          background: 'rgba(10,10,10,0.92)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid #1A1A1A',
        }}
      >
        <Link href="/" className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-[6px] flex items-center justify-center"
            style={{ background: '#161616', border: '1px solid #262626' }}
          >
            <Image src="/reform_logo.png" alt="Reform" width={14} height={14} className="object-contain opacity-90" />
          </div>
          <span className="text-[13px] font-semibold" style={{ color: '#E5E7EB' }}>
            Reform
          </span>
        </Link>
        <AccountMenu />
      </header>
      <nav
        className="fixed top-[52px] left-0 right-0 z-30 md:hidden overflow-x-auto"
        style={{ background: '#0A0A0A', borderBottom: '1px solid #1A1A1A' }}
      >
        <div className="flex items-center gap-0.5 px-3 py-1.5 min-w-max">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-1.5 h-7 px-2.5 rounded-[6px] text-[12px] font-medium transition-colors whitespace-nowrap"
                style={{
                  color: isActive ? '#E5E7EB' : '#9CA3AF',
                  background: isActive ? '#161616' : 'transparent',
                  border: isActive ? '1px solid #262626' : '1px solid transparent',
                }}
              >
                {item.icon(isActive)}
                {item.label}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* ── Main content ── */}
      <main
        className="min-h-screen relative md:ml-[240px] rw-grid-texture"
        style={{
          background: '#0D0D0D',
          paddingTop: 0,
        }}
      >
        <div className="pt-[100px] md:pt-0 min-h-screen">{children}</div>
      </main>
    </div>
  )
}
