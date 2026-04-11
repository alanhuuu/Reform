'use client'

import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import InteractiveBackground from '@/components/landing/InteractiveBackground'
import { useSubscription } from '@/lib/useSubscription'
import { apiUrl } from '@/lib/api'
import { BILLING_ENABLED } from '@/lib/billing'

export default function SettingsPage() {
  const { data: session, status } = useSession()
  const { subscription, isFree } = useSubscription()
  const router = useRouter()
  const [portalLoading, setPortalLoading] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/signin?next=/settings')
    }
  }, [status, router])

  async function openBillingPortal() {
    if (!session?.githubId) return
    setPortalLoading(true)
    try {
      const res = await fetch(apiUrl('/billing/create-portal-session'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ github_user_id: session.githubId }),
      })
      if (!res.ok) throw new Error()
      const { portal_url } = await res.json()
      window.location.href = portal_url
    } catch {
      router.push('/subscription')
    } finally {
      setPortalLoading(false)
    }
  }

  if (status !== 'authenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#05070c' }}>
        <div className="w-5 h-5 rounded-full animate-spin" style={{ border: '2px solid rgba(168,85,247,0.2)', borderTopColor: '#a855f7' }} />
      </div>
    )
  }

  return (
    <main className="app-shell min-h-screen overflow-x-hidden">
      <InteractiveBackground />
      <div className="relative" style={{ zIndex: 1 }}>
        <Navbar />

        <section className="pt-28 sm:pt-36 pb-24">
          <div className="max-w-3xl mx-auto px-4 sm:px-6">
            <div className="mb-10">
              <div className="eyebrow mb-3">Settings</div>
              <h1 className="text-[clamp(28px,5vw,40px)] font-bold text-white" style={{ letterSpacing: '-0.03em' }}>
                Preferences
              </h1>
            </div>

            {/* Subscription & Billing */}
            {BILLING_ENABLED && (
              <SettingsSection title="Subscription & Billing">
                <SettingsRow
                  label="Current Plan"
                  value={
                    <span
                      className="text-[12px] font-semibold px-2.5 py-1 rounded-lg"
                      style={{
                        background: isFree ? 'rgba(255,255,255,0.06)' : 'rgba(124,140,255,0.15)',
                        color: isFree ? 'rgba(255,255,255,0.5)' : '#aab4ff',
                        border: isFree ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(170,180,255,0.2)',
                      }}
                    >
                      {subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)}
                    </span>
                  }
                  action={
                    <button
                      onClick={() => router.push('/subscription')}
                      className="text-[12px] font-medium transition-colors"
                      style={{ color: '#aab4ff' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#c4cbff')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = '#aab4ff')}
                    >
                      {isFree ? 'Upgrade' : 'Change plan'}
                    </button>
                  }
                />
                {!isFree && (
                  <SettingsRow
                    label="Billing"
                    value={
                      <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                        Managed via Stripe
                      </span>
                    }
                    action={
                      <button
                        onClick={openBillingPortal}
                        disabled={portalLoading}
                        className="text-[12px] font-medium transition-colors disabled:opacity-50"
                        style={{ color: '#aab4ff' }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#c4cbff')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = '#aab4ff')}
                      >
                        {portalLoading ? 'Opening...' : 'Manage'}
                      </button>
                    }
                  />
                )}
                {subscription.current_period_end && (
                  <SettingsRow
                    label="Next billing date"
                    value={
                      <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                        {new Date(subscription.current_period_end).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    }
                  />
                )}
              </SettingsSection>
            )}

            {/* Connected Account */}
            <SettingsSection title="Connected Account">
              <SettingsRow
                label="GitHub"
                value={
                  <div className="flex items-center gap-2">
                    {session.user?.image && (
                      <img src={session.user.image} alt="" className="w-5 h-5 rounded-full" style={{ border: '1px solid rgba(255,255,255,0.1)' }} />
                    )}
                    <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
                      {session.githubUsername ? `@${session.githubUsername}` : session.user?.name || 'Connected'}
                    </span>
                  </div>
                }
              />
              {session.user?.email && (
                <SettingsRow
                  label="Email"
                  value={
                    <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                      {session.user.email}
                    </span>
                  }
                />
              )}
            </SettingsSection>

            {/* Danger Zone */}
            <SettingsSection title="Session">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>
                    Sign out
                  </div>
                  <div className="text-[12px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    End your current session on this device.
                  </div>
                </div>
                <button
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="px-4 py-2 rounded-xl text-[12px] font-medium transition-all duration-150"
                  style={{
                    color: 'rgba(255,100,100,0.8)',
                    background: 'rgba(255,80,80,0.06)',
                    border: '1px solid rgba(255,80,80,0.12)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,80,80,0.12)'
                    e.currentTarget.style.borderColor = 'rgba(255,80,80,0.2)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255,80,80,0.06)'
                    e.currentTarget.style.borderColor = 'rgba(255,80,80,0.12)'
                  }}
                >
                  Sign Out
                </button>
              </div>
            </SettingsSection>
          </div>
        </section>

        <Footer />
      </div>
    </main>
  )
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="surface-panel rounded-[24px] p-6 sm:p-8 mb-5">
      <div className="mono text-[11px] mb-5" style={{ color: 'rgba(255,255,255,0.3)' }}>
        {title}
      </div>
      <div className="space-y-4">
        {children}
      </div>
    </div>
  )
}

function SettingsRow({ label, value, action }: { label: string; value: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="text-[13px] font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>
        {label}
      </div>
      <div className="flex items-center gap-4">
        {value}
        {action}
      </div>
    </div>
  )
}
