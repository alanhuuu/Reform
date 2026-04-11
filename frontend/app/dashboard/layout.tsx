'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ProgressProvider, useProgress } from '@/components/dashboard/ProgressContext'
import InteractiveBackground from '@/components/landing/InteractiveBackground'
import AccountMenu from '@/components/layout/AccountMenu'
import { Spinner } from '@/components/ui'
import { clearSelectedRepo } from '@/lib/selectedRepo'

const NAV_ITEMS = [
  { href: '/dashboard/discovery', label: 'Discovery' },
  { href: '/dashboard/simulation', label: 'Analysis' },
  { href: '/dashboard/transform', label: 'Transform' },
  { href: '/dashboard/edit-lab', label: 'The Lab' },
]

function GlobalProgressBar() {
  const { state } = useProgress()
  const pathname = usePathname()
  if (!state.active || pathname === '/dashboard/discovery') return null
  return (
    <div className="fixed top-0 left-0 right-0 z-[100] pointer-events-none">
      <div className="h-[1.5px] w-full bg-white/[0.04]">
        <div
          className="h-full transition-[width] duration-700 ease-out"
          style={{
            width: `${state.progress}%`,
            background: 'linear-gradient(90deg, #10B981, #34D399)',
            boxShadow: '0 0 20px rgba(16,185,129,0.35)',
          }}
        />
      </div>
      {state.label && (
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-medium tracking-[-0.01em]"
          style={{
            background: 'rgba(10,10,10,0.9)',
            color: 'rgba(255,255,255,0.55)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(10px)',
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
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: '#0A0A0A' }}
      >
        <Spinner size={20} />
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
    <div className="min-h-screen relative" style={{ background: '#0A0A0A' }}>
      <InteractiveBackground />
      <GlobalProgressBar />

      {/* ── Header ── */}
      <header
        className="fixed top-0 left-0 right-0 z-50"
        style={{
          background: 'rgba(10,10,10,0.72)',
          backdropFilter: 'blur(20px) saturate(140%)',
          WebkitBackdropFilter: 'blur(20px) saturate(140%)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-[60px] flex items-center justify-between gap-4">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-2.5 flex-shrink-0 group">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-transform duration-200 group-hover:scale-105"
              style={{
                background: '#151518',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <Image
                src="/reform_logo.png"
                alt="Reform"
                width={16}
                height={16}
                className="object-contain opacity-90"
              />
            </div>
            <span
              className="text-[14px] font-semibold text-white hidden sm:block"
              style={{ letterSpacing: '-0.02em' }}
            >
              Reform
            </span>
          </Link>

          {/* Nav */}
          <nav className="flex items-center gap-0.5 rounded-full p-1 hidden md:flex" style={{
            background: 'rgba(255,255,255,0.025)',
            border: '1px solid rgba(255,255,255,0.05)',
          }}>
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href
              const isLocked =
                item.href === '/dashboard/discovery' && progressState.active && !isActive
              return (
                <Link
                  key={item.href}
                  href={isLocked ? '#' : item.href}
                  onClick={(e) => isLocked && e.preventDefault()}
                  className={`relative px-3.5 py-1.5 rounded-full text-[12.5px] font-medium transition-colors duration-200 ${
                    isLocked ? 'pointer-events-none opacity-25' : ''
                  }`}
                  style={{
                    color: isActive ? '#FFFFFF' : '#A1A1AA',
                    background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                    letterSpacing: '-0.01em',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive && !isLocked)
                      e.currentTarget.style.color = '#FFFFFF'
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive && !isLocked)
                      e.currentTarget.style.color = '#A1A1AA'
                  }}
                >
                  {item.label}
                  {isActive && (
                    <span
                      className="absolute left-1/2 -translate-x-1/2 -bottom-[7px] w-1 h-1 rounded-full"
                      style={{
                        background: '#10B981',
                        boxShadow: '0 0 8px rgba(16,185,129,0.6)',
                      }}
                    />
                  )}
                </Link>
              )
            })}
          </nav>

          {/* Right */}
          <div className="flex items-center gap-2">
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
              className="text-[12px] font-medium px-3 py-1.5 rounded-full transition-all duration-200 hidden sm:block"
              style={{
                color: '#A1A1AA',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'transparent',
                letterSpacing: '-0.01em',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#FFFFFF'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#A1A1AA'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
              }}
            >
              New analysis
            </button>
            <AccountMenu />
          </div>
        </div>
      </header>

      {/* ── Mobile nav ── */}
      <nav
        className="fixed top-[60px] left-0 right-0 z-40 md:hidden overflow-x-auto"
        style={{
          background: 'rgba(10,10,10,0.95)',
          backdropFilter: 'blur(14px)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <div className="flex items-center gap-1 px-3 py-2 min-w-max">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors whitespace-nowrap"
                style={{
                  color: isActive ? '#FFFFFF' : '#71717A',
                  background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                }}
              >
                {item.label}
              </Link>
            )
          })}
        </div>
      </nav>

      <main className="pt-[88px] md:pt-[60px] min-h-screen relative" style={{ zIndex: 1 }}>
        {children}
      </main>
    </div>
  )
}
