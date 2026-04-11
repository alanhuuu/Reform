'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import AccountMenu from '@/components/layout/AccountMenu'
import { BILLING_ENABLED } from '@/lib/billing'

function Separator() {
  return (
    <div
      className="w-px h-4 flex-shrink-0"
      style={{ background: 'rgba(255,255,255,0.10)' }}
    />
  )
}

export default function Navbar() {
  const { data: session, status } = useSession()
  const pathname = usePathname()

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 border-b backdrop-blur-2xl"
      style={{ background: 'rgba(5,7,12,0.78)', borderColor: 'var(--color-border)' }}
    >
      <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 sm:h-[72px] flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, rgba(124,140,255,0.16) 0%, rgba(124,140,255,0.06) 100%)',
              border: '1px solid rgba(170,180,255,0.12)',
            }}
          >
            <Image src="/reform_justlogo.png" alt="Reform" width={34} height={34} className="object-contain" />
          </div>
          <div className="leading-none">
            <div className="text-[15px] font-semibold text-white" style={{ letterSpacing: '-0.02em' }}>Reform</div>
            <div className="text-[10px] mono" style={{ color: 'var(--color-text-muted)' }}>frontend intelligence</div>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          {BILLING_ENABLED && (
            <>
              <Link
                href="/subscription"
                className="text-[13px] px-3 py-1.5 rounded-lg transition-colors duration-150"
                style={{ color: 'rgba(255,255,255,0.55)' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.85)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.55)')}
              >
                Pricing
              </Link>

              <Separator />
            </>
          )}

          <Link
            href="/new"
            className="text-[13px] px-3 py-1.5 rounded-lg transition-colors duration-150"
            style={{ color: 'rgba(255,255,255,0.55)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.85)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.55)')}
          >
            Get Started
          </Link>

          <Separator />

          {status === 'loading' ? (
            <div className="w-8 h-8 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
          ) : session?.user ? (
            <AccountMenu />
          ) : (
            <Link
              href={`/signin?next=${encodeURIComponent(pathname)}`}
              className="text-[13px] px-4 py-1.5 rounded-xl font-medium transition-all duration-150"
              style={{
                background: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.7)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.10)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.9)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
              }}
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}
