'use client'

import Link from 'next/link'

interface UpgradeBannerProps {
  message: string
  compact?: boolean
}

export default function UpgradeBanner({ message, compact }: UpgradeBannerProps) {
  if (compact) {
    return (
      <Link
        href="/subscription"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all hover:brightness-110"
        style={{
          background: 'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(124,58,237,0.06))',
          border: '1px solid rgba(124,58,237,0.2)',
          color: 'rgba(168,85,247,0.8)',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
        {message}
      </Link>
    )
  }

  return (
    <div
      className="rounded-xl p-4 flex items-center justify-between gap-4"
      style={{
        background: 'linear-gradient(135deg, rgba(124,58,237,0.08), rgba(124,58,237,0.03))',
        border: '1px solid rgba(124,58,237,0.15)',
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.15)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(168,85,247,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </div>
        <p className="text-[13px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
          {message}
        </p>
      </div>
      <Link
        href="/subscription"
        className="px-4 py-2 rounded-lg text-[12px] font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98] flex-shrink-0"
        style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}
      >
        Upgrade
      </Link>
    </div>
  )
}
