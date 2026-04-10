'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import Link from 'next/link'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import InteractiveBackground from '@/components/landing/InteractiveBackground'
import { useSubscription } from '@/lib/useSubscription'

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  max: 'Team',
  enterprise: 'Enterprise',
}

export default function AccountPage() {
  const { data: session, status } = useSession()
  const { subscription, loading: subLoading } = useSubscription()
  const router = useRouter()

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/signin?next=/account')
    }
  }, [status, router])

  if (status !== 'authenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#05070c' }}>
        <div className="w-5 h-5 rounded-full animate-spin" style={{ border: '2px solid rgba(168,85,247,0.2)', borderTopColor: '#a855f7' }} />
      </div>
    )
  }

  const planLabel = PLAN_LABELS[subscription.plan] || subscription.plan
  const scansPercent = subscription.scans_limit > 0
    ? Math.min(100, Math.round((subscription.scans_used / subscription.scans_limit) * 100))
    : 0
  const reposDisplay = subscription.repos_limit === -1
    ? `${subscription.repos_connected} / Unlimited`
    : `${subscription.repos_connected} / ${subscription.repos_limit}`

  return (
    <main className="app-shell min-h-screen overflow-x-hidden">
      <InteractiveBackground />
      <div className="relative" style={{ zIndex: 1 }}>
        <Navbar />

        <section className="pt-28 sm:pt-36 pb-24">
          <div className="max-w-3xl mx-auto px-4 sm:px-6">
            <div className="mb-10">
              <div className="eyebrow mb-3">Account</div>
              <h1 className="text-[clamp(28px,5vw,40px)] font-bold text-white" style={{ letterSpacing: '-0.03em' }}>
                Your profile
              </h1>
            </div>

            {/* GitHub Profile */}
            <div className="surface-panel rounded-[24px] p-6 sm:p-8 mb-5">
              <div className="mono text-[11px] mb-5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                Connected Account
              </div>
              <div className="flex items-center gap-4">
                {session.user?.image ? (
                  <img
                    src={session.user.image}
                    alt=""
                    className="w-14 h-14 rounded-2xl"
                    style={{ border: '1px solid rgba(255,255,255,0.1)' }}
                  />
                ) : (
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-bold"
                    style={{ background: 'rgba(124,140,255,0.2)', color: '#aab4ff' }}
                  >
                    {session.user?.name?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-lg font-semibold text-white truncate">
                    {session.user?.name || 'User'}
                  </div>
                  {session.githubUsername && (
                    <div className="text-sm truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      @{session.githubUsername}
                    </div>
                  )}
                  {session.user?.email && (
                    <div className="text-[13px] mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      {session.user.email}
                    </div>
                  )}
                </div>
                <div className="ml-auto flex items-center gap-2 flex-shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="rgba(255,255,255,0.35)">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                  <span className="text-[12px] font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    GitHub
                  </span>
                </div>
              </div>
            </div>

            {/* Plan & Usage */}
            <div className="surface-panel rounded-[24px] p-6 sm:p-8 mb-5">
              <div className="flex items-center justify-between mb-5">
                <div className="mono text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  Current Plan
                </div>
                <div
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg"
                  style={{
                    background: subscription.plan === 'free'
                      ? 'rgba(255,255,255,0.06)'
                      : 'rgba(124,140,255,0.15)',
                    color: subscription.plan === 'free'
                      ? 'rgba(255,255,255,0.5)'
                      : '#aab4ff',
                    border: subscription.plan === 'free'
                      ? '1px solid rgba(255,255,255,0.08)'
                      : '1px solid rgba(170,180,255,0.2)',
                  }}
                >
                  {planLabel}
                </div>
              </div>

              {!subLoading && (
                <div className="space-y-5">
                  {/* Scans usage */}
                  <div>
                    <div className="flex justify-between text-[13px] mb-2">
                      <span style={{ color: 'rgba(255,255,255,0.55)' }}>UI Scans</span>
                      <span style={{ color: 'rgba(255,255,255,0.4)' }}>
                        {subscription.scans_used} / {subscription.scans_limit}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${scansPercent}%`,
                          background: scansPercent >= 90
                            ? 'linear-gradient(90deg, #ff6b6b, #ff8080)'
                            : 'linear-gradient(90deg, #7c8cff, #aab4ff)',
                        }}
                      />
                    </div>
                  </div>

                  {/* Repos */}
                  <div className="flex justify-between text-[13px]">
                    <span style={{ color: 'rgba(255,255,255,0.55)' }}>Connected Repos</span>
                    <span style={{ color: 'rgba(255,255,255,0.4)' }}>{reposDisplay}</span>
                  </div>

                  {/* Features */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <FeatureBadge label="PR Auto-fix" enabled={subscription.features.pr_autofix} />
                    <FeatureBadge label="Full Reports" enabled={subscription.features.full_report} />
                  </div>
                </div>
              )}

              <div className="mt-6 pt-5 border-t flex flex-wrap gap-3" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <Link
                  href="/subscription"
                  className="btn-ghost px-4 py-2 rounded-xl text-[13px] font-medium inline-flex items-center gap-2"
                >
                  {subscription.plan === 'free' ? 'Upgrade Plan' : 'View Plans'}
                </Link>
              </div>
            </div>

            {/* Quick Links */}
            <div className="surface-panel rounded-[24px] p-6 sm:p-8">
              <div className="mono text-[11px] mb-5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                Quick Links
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <QuickLink href="/dashboard" label="Dashboard" description="View your projects and analyses" />
                <QuickLink href="/settings" label="Settings" description="Manage your preferences" />
                <QuickLink href="/subscription" label="Plans & Pricing" description="Compare plans and upgrade" />
                <QuickLink href="/dashboard/discovery" label="New Analysis" description="Start analyzing a repository" />
              </div>
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </main>
  )
}

function FeatureBadge({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <span
      className="text-[11px] font-medium px-2.5 py-1 rounded-lg"
      style={{
        background: enabled ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.04)',
        color: enabled ? 'rgba(74,222,128,0.8)' : 'rgba(255,255,255,0.25)',
        border: enabled ? '1px solid rgba(34,197,94,0.15)' : '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {enabled ? '\u2713' : '\u2014'} {label}
    </span>
  )
}

function QuickLink({ href, label, description }: { href: string; label: string; description: string }) {
  return (
    <Link href={href} className="surface-interactive rounded-2xl p-4 block">
      <div className="text-[13px] font-medium text-white mb-1">{label}</div>
      <div className="text-[12px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{description}</div>
    </Link>
  )
}
