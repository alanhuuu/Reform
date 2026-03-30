'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { ProgressProvider, useProgress } from '@/components/dashboard/ProgressContext'
import InteractiveBackground from '@/components/landing/InteractiveBackground'

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
        <div className="h-full transition-all duration-700 ease-out" style={{ width: `${state.progress}%`, background: 'linear-gradient(90deg, #7c3aed, #a855f7)', boxShadow: '0 0 20px rgba(124,58,237,0.4)' }} />
      </div>
      {state.label && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full text-[10px] font-medium" style={{ background: 'rgba(13,12,22,0.9)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}>
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
    <div className="min-h-screen" style={{ background: '#13111c' }}>
      {pathname !== '/dashboard/transform' && pathname !== '/dashboard/simulation' && <InteractiveBackground />}
      <GlobalProgressBar />

      {/* Navbar — matches landing page exactly */}
      <header className="fixed top-0 left-0 right-0 z-50 px-3 sm:px-6 py-3 flex justify-between items-center" style={{ background: 'rgba(19,17,28,0.8)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3 sm:gap-8 min-w-0">
          <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
            <Image src="/reform_logo.png" alt="Reform" width={160} height={50} className="object-contain max-w-[100px] sm:max-w-[160px]" />
          </Link>

          <nav className="hidden sm:flex items-center gap-1">
            {NAV_ITEMS.map((item, i) => {
              const isActive = pathname === item.href
              const isLocked = item.href === '/dashboard/discovery' && progressState.active
              return (
                <div key={item.href} className="flex items-center gap-1">
                  {i > 0 && <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: '16px' }}>→</span>}
                  {isLocked
                    ? <div className="px-3 py-1.5 text-[12px] font-medium opacity-20" style={{ color: 'rgba(255,255,255,0.5)' }}>{item.label}</div>
                    : <Link href={item.href} className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors" style={isActive ? { background: 'rgba(255,255,255,0.06)', color: 'white' } : { color: 'rgba(255,255,255,0.35)' }}>{item.label}</Link>
                  }
                </div>
              )
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => { sessionStorage.removeItem('refineui_analysis'); sessionStorage.removeItem('refineui_discovery'); sessionStorage.removeItem('refineui_answers'); sessionStorage.removeItem('refineui_analysis_cache'); sessionStorage.removeItem('refineui_transform'); sessionStorage.removeItem('refineui_repo'); window.location.href = '/dashboard/discovery' }} className="px-2 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
            New Analysis
          </button>
        </div>
      </header>

      {/* Mobile nav — visible on small screens only */}
      <div className="fixed top-[49px] left-0 right-0 z-40 sm:hidden overflow-x-auto" style={{ background: 'rgba(19,17,28,0.95)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div className="flex items-center gap-1 px-3 py-2">
          {NAV_ITEMS.map((item, i) => {
            const isActive = pathname === item.href
            return (
              <Link key={item.href} href={item.href} className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap flex-shrink-0" style={isActive ? { background: 'rgba(255,255,255,0.06)', color: 'white' } : { color: 'rgba(255,255,255,0.35)' }}>
                {item.label}
              </Link>
            )
          })}
        </div>
      </div>

      <main className="pt-[88px] sm:pt-16 min-h-screen relative" style={{ zIndex: 1 }}>{children}</main>
    </div>
  )
}
