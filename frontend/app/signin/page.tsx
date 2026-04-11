'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn, useSession } from 'next-auth/react'
import Image from 'next/image'
import InteractiveBackground from '@/components/landing/InteractiveBackground'
import { Spinner } from '@/components/ui'

function SignInContent() {
  const { status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()

  const raw = searchParams.get('next') || searchParams.get('callbackUrl') || '/dashboard'
  const next = raw.startsWith('/signin') ? '/dashboard' : raw

  useEffect(() => {
    if (status === 'authenticated') router.replace(next)
  }, [status, next, router])

  if (status === 'loading' || status === 'authenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size={20} />
      </div>
    )
  }

  return (
    <div className="min-h-screen relative" style={{ background: '#0A0A0A' }}>
      <InteractiveBackground />
      <div
        className="relative min-h-screen flex items-center justify-center px-4"
        style={{ zIndex: 1 }}
      >
        <div
          className="w-full max-w-[420px] rounded-[24px] p-10 text-center"
          style={{
            background: '#111113',
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow:
              '0 1px 0 rgba(255,255,255,0.05) inset, 0 32px 80px rgba(0,0,0,0.6)',
          }}
        >
          <div
            className="w-14 h-14 rounded-[16px] mx-auto mb-7 flex items-center justify-center"
            style={{
              background: '#151518',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <Image src="/reform_logo.png" alt="Reform" width={22} height={22} className="object-contain opacity-90" />
          </div>

          <div
            className="text-[11px] font-medium uppercase tracking-[0.14em] mb-3"
            style={{ color: '#10B981', fontFamily: 'var(--font-mono), monospace' }}
          >
            REFORM
          </div>
          <h1
            className="text-[26px] font-semibold text-white mb-3"
            style={{ letterSpacing: '-0.025em' }}
          >
            Sign in to continue
          </h1>
          <p className="text-[13px] mb-9 leading-[1.6]" style={{ color: '#A1A1AA' }}>
            Connect your GitHub account to start transforming your UI.
          </p>

          <button
            onClick={() => signIn('github', { callbackUrl: next })}
            className="w-full h-12 flex items-center justify-center gap-2.5 rounded-[12px] text-[14px] font-semibold transition-all duration-200"
            style={{
              background: '#FFFFFF',
              color: '#0A0A0A',
              letterSpacing: '-0.01em',
              boxShadow: '0 1px 0 rgba(0,0,0,0.06) inset, 0 8px 24px rgba(255,255,255,0.08)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow =
                '0 1px 0 rgba(0,0,0,0.06) inset, 0 12px 32px rgba(255,255,255,0.12)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow =
                '0 1px 0 rgba(0,0,0,0.06) inset, 0 8px 24px rgba(255,255,255,0.08)'
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="#0A0A0A">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Continue with GitHub
          </button>

          <p className="text-[11px] mt-6" style={{ color: '#6B7280' }}>
            We only request read access to your repositories and profile.
          </p>

          <button
            onClick={() => {
              if (window.history.length > 1) router.back()
              else router.push('/')
            }}
            className="mt-7 inline-flex items-center gap-1.5 text-[12px] font-medium transition-colors"
            style={{ color: '#6B7280' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#A1A1AA')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#6B7280')}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Go back
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Spinner size={20} />
        </div>
      }
    >
      <SignInContent />
    </Suspense>
  )
}
