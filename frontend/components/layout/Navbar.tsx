'use client'

import Link from 'next/link'
import Image from 'next/image'

export default function Navbar() {
  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 border-b backdrop-blur-2xl"
      style={{ background: 'rgba(5,7,12,0.78)', borderColor: 'var(--color-border)' }}
    >
      <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 sm:h-[72px] flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'linear-gradient(180deg, rgba(124,140,255,0.16) 0%, rgba(124,140,255,0.06) 100%)',
              border: '1px solid rgba(170,180,255,0.12)',
            }}
          >
            <Image src="/reform_logo.png" alt="Reform" width={20} height={20} className="object-contain" />
          </div>
          <div className="leading-none">
            <div className="text-[15px] font-semibold text-white" style={{ letterSpacing: '-0.02em' }}>Reform</div>
            <div className="text-[10px] mono" style={{ color: 'var(--color-text-muted)' }}>frontend intelligence</div>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/subscription"
            className="btn-ghost text-[13px] px-4 py-2 rounded-xl flex items-center gap-2"
          >
            <span className="hidden sm:inline">Pricing</span>
            <svg className="sm:hidden" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1.75l3 6.08 6.71.98-4.86 4.74 1.15 6.7L12 17.05l-6 3.18 1.15-6.7-4.86-4.74 6.71-.98 3-6.08z" />
            </svg>
          </Link>
          <Link
            href="/new"
            className="btn-primary text-[13px] px-5 py-2 rounded-xl font-semibold inline-flex items-center gap-1.5"
          >
            Get Started
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
        </div>
      </div>
    </nav>
  )
}
