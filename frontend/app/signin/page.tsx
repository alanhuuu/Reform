'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn, useSession } from 'next-auth/react'
import Image from 'next/image'
import InteractiveBackground from '@/components/landing/InteractiveBackground'

function SignInContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()

  // Resolve redirect target: our `next` param, NextAuth's `callbackUrl`, or /dashboard.
  // Never redirect back to /signin itself.
  const raw = searchParams.get('next') || searchParams.get('callbackUrl') || '/dashboard'
  const next = raw.startsWith('/signin') ? '/dashboard' : raw

  // Already signed in — redirect immediately
  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(next)
    }
  }, [status, next, router])

  if (status === 'loading' || status === 'authenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-5 h-5 rounded-full animate-spin" style={{ border: '2px solid rgba(168,85,247,0.2)', borderTopColor: '#a855f7' }} />
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <InteractiveBackground />
      <div className="relative min-h-screen flex items-center justify-center px-4" style={{ zIndex: 1 }}>
        <div
          className="w-full max-w-sm rounded-[28px] p-8 sm:p-10 text-center"
          style={{
            background: 'linear-gradient(180deg, rgba(124,140,255,0.08) 0%, rgba(124,140,255,0.02) 100%)',
            border: '1px solid rgba(170,180,255,0.14)',
            boxShadow: '0 40px 120px rgba(86,102,245,0.12), 0 0 60px rgba(124,140,255,0.04)',
          }}
        >
          <div
            className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, rgba(124,140,255,0.2) 0%, rgba(124,140,255,0.08) 100%)',
              border: '1px solid rgba(170,180,255,0.16)',
            }}
          >
            <Image src="/reform_justlogo.png" alt="Reform" width={48} height={48} className="object-contain" />
          </div>

          <h1 className="text-xl font-bold text-white mb-2" style={{ letterSpacing: '-0.02em' }}>
            Sign in to continue
          </h1>
          <p className="text-[13px] mb-8" style={{ color: 'rgba(255,255,255,0.4)', lineHeight: '1.7' }}>
            Connect your GitHub account to use Reform.
          </p>

          <button
            onClick={() => signIn('github', { callbackUrl: next })}
            className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.98]"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Continue with GitHub
          </button>

          <p className="text-[11px] mt-6" style={{ color: 'rgba(255,255,255,0.2)' }}>
            We only request access to your repositories and profile.
          </p>

          <button
            onClick={() => {
              if (window.history.length > 1) router.back()
              else router.push('/')
            }}
            className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-medium transition-all"
            style={{
              color: 'rgba(255,255,255,0.45)',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'rgba(255,255,255,0.45)'
              e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-5 h-5 rounded-full animate-spin" style={{ border: '2px solid rgba(168,85,247,0.2)', borderTopColor: '#a855f7' }} />
      </div>
    }>
      <SignInContent />
    </Suspense>
  )
}
