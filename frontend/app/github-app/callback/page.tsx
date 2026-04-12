'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { apiUrl } from '@/lib/api'

/**
 * GitHub App install callback page.
 *
 * GitHub redirects users here after they complete the "Install Reform" flow
 * with `?installation_id=...&setup_action=install&state=<github_user_id>`.
 * We POST the installation_id to the backend so it can persist the row,
 * then bounce the user back into the dashboard.
 *
 * Wrapped in Suspense because `useSearchParams` requires a Suspense boundary
 * during the static-prerender step of the Next.js build.
 */
export default function GithubAppCallbackPage() {
  return (
    <Suspense fallback={<CallbackShell status="working" message="Linking your GitHub installation…" />}>
      <CallbackInner />
    </Suspense>
  )
}

function CallbackInner() {
  const router = useRouter()
  const params = useSearchParams()
  const { data: session, status: sessionStatus } = useSession()
  const [status, setStatus] = useState<'working' | 'error' | 'done'>('working')
  const [message, setMessage] = useState('Linking your GitHub installation…')
  const submitted = useRef(false)

  useEffect(() => {
    // Wait for the NextAuth session to load — without `githubId` we can't
    // tell the backend who the installation belongs to.
    if (sessionStatus === 'loading') return
    if (submitted.current) return

    const installationId = params?.get('installation_id') || ''
    const setupAction = params?.get('setup_action') || ''
    const stateUserId = params?.get('state') || ''

    if (!installationId) {
      setStatus('error')
      setMessage('Missing installation_id in callback URL.')
      return
    }
    // GitHub uses `request` for "user requested install but org admin must
    // approve". We can't persist anything yet — surface the state to the user.
    if (setupAction === 'request') {
      setStatus('done')
      setMessage('Request sent. An organization owner must approve the install before Reform can access these repos.')
      return
    }

    const githubUserId = (session as { githubId?: string } | null)?.githubId || stateUserId
    if (!githubUserId) {
      setStatus('error')
      setMessage('Could not determine your account. Please sign in to Reform first, then re-install.')
      return
    }

    submitted.current = true
    fetch(apiUrl('/github-app/installation-callback'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        installation_id: installationId,
        github_user_id: githubUserId,
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text()
          throw new Error(text || `HTTP ${res.status}`)
        }
        setStatus('done')
        setMessage('Installation linked. Redirecting…')
        // Brief pause so the user sees the success state before the bounce.
        setTimeout(() => router.replace('/dashboard/transform'), 800)
      })
      .catch((e) => {
        submitted.current = false
        setStatus('error')
        setMessage(
          e instanceof Error
            ? `Failed to link installation: ${e.message}`
            : 'Failed to link installation.',
        )
      })
  }, [params, router, session, sessionStatus])

  return <CallbackShell status={status} message={message} />
}

function CallbackShell({ status, message }: { status: 'working' | 'error' | 'done'; message: string }) {
  const accent =
    status === 'error' ? '#f87171' : status === 'done' ? '#34d399' : 'rgba(255,255,255,0.7)'
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: '#0a0a0a', color: '#fff' }}
    >
      <div
        className="max-w-md w-full mx-4 rounded-xl p-8 text-center"
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div
          className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center"
          style={{
            background: 'rgba(168,85,247,0.1)',
            border: '1px solid rgba(168,85,247,0.25)',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {status === 'working' && <circle cx="12" cy="12" r="9" />}
            {status === 'done' && <path d="M20 6L9 17l-5-5" />}
            {status === 'error' && (
              <>
                <circle cx="12" cy="12" r="9" />
                <line x1="12" y1="8" x2="12" y2="13" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </>
            )}
          </svg>
        </div>
        <p className="text-[14px] font-semibold mb-1">
          {status === 'working' && 'Connecting GitHub'}
          {status === 'done' && 'All set'}
          {status === 'error' && 'Something went wrong'}
        </p>
        <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
          {message}
        </p>
      </div>
    </div>
  )
}
