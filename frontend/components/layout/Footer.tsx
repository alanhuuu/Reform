'use client'

import Link from 'next/link'

export default function Footer() {
  return (
    <footer
      className="border-t"
      style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(6,8,13,0.76)' }}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-8 py-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <p className="text-sm font-semibold text-white mb-1" style={{ letterSpacing: '-0.02em' }}>Reform</p>
          <p className="text-xs max-w-xs" style={{ color: 'rgba(255,255,255,0.35)', lineHeight: 1.7 }}>
            Upgrade visual quality, preserve the logic, and ship cleaner interfaces with less churn.
          </p>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/subscription" className="link-muted text-xs tracking-[0.18em] uppercase">
            Pricing
          </Link>
          <span className="link-muted text-xs tracking-[0.18em] uppercase cursor-default">
            Privacy
          </span>
          <span className="link-muted text-xs tracking-[0.18em] uppercase cursor-default">
            Terms
          </span>
          <span className="text-xs mono" style={{ color: 'rgba(255,255,255,0.22)' }}>&copy; 2026</span>
        </div>
      </div>
    </footer>
  )
}
