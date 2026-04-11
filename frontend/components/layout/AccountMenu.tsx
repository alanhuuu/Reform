'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import { apiUrl } from '@/lib/api'
import { useSubscription } from '@/lib/useSubscription'
import { BILLING_ENABLED } from '@/lib/billing'

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  max: 'Team',
  enterprise: 'Enterprise',
}

export default function AccountMenu() {
  const { data: session } = useSession()
  const { subscription } = useSubscription()
  const [open, setOpen] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

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
      // If no subscription exists, redirect to pricing instead
      window.location.href = '/subscription'
    } finally {
      setPortalLoading(false)
    }
  }

  if (!session?.user) return null

  const planLabel = PLAN_LABELS[subscription.plan] || subscription.plan

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl transition-all duration-150"
        style={{
          background: open ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
          border: '1px solid',
          borderColor: open ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.08)',
        }}
        onMouseEnter={(e) => {
          if (!open) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
        }}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
        }}
      >
        {session.user.image ? (
          <img
            src={session.user.image}
            alt=""
            className="w-6 h-6 rounded-full"
            style={{ border: '1px solid rgba(255,255,255,0.12)' }}
          />
        ) : (
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold"
            style={{ background: 'rgba(124,140,255,0.2)', color: '#aab4ff' }}
          >
            {session.user.name?.[0]?.toUpperCase() || '?'}
          </div>
        )}
        <span className="hidden sm:inline text-[13px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
          {session.user.name || 'Account'}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="hidden sm:block transition-transform duration-150"
          style={{
            color: 'rgba(255,255,255,0.3)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-64 rounded-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, rgba(13,17,26,0.97) 0%, rgba(9,12,19,0.97) 100%)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 24px 80px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.1)',
            backdropFilter: 'blur(24px)',
            animation: 'menuFadeIn 0.15s ease-out',
          }}
        >
          {/* User header */}
          <div className="px-4 py-3.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
            <div className="flex items-center gap-3">
              {session.user.image ? (
                <img
                  src={session.user.image}
                  alt=""
                  className="w-9 h-9 rounded-full flex-shrink-0"
                  style={{ border: '1px solid rgba(255,255,255,0.12)' }}
                />
              ) : (
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                  style={{ background: 'rgba(124,140,255,0.2)', color: '#aab4ff' }}
                >
                  {session.user.name?.[0]?.toUpperCase() || '?'}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-white truncate">
                  {session.user.name || 'User'}
                </div>
                {session.githubUsername && (
                  <div className="text-[11px] truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    @{session.githubUsername}
                  </div>
                )}
              </div>
              <div
                className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-md flex-shrink-0"
                style={{
                  background: subscription.plan === 'free'
                    ? 'rgba(255,255,255,0.06)'
                    : 'rgba(124,140,255,0.15)',
                  color: subscription.plan === 'free'
                    ? 'rgba(255,255,255,0.45)'
                    : '#aab4ff',
                  border: subscription.plan === 'free'
                    ? '1px solid rgba(255,255,255,0.08)'
                    : '1px solid rgba(170,180,255,0.2)',
                }}
              >
                {planLabel}
              </div>
            </div>
          </div>

          {/* Navigation links */}
          <div className="py-1.5">
            <MenuLink href="/account" icon={<UserIcon />} label="Account" onClick={() => setOpen(false)} />
            <MenuLink href="/settings" icon={<SettingsIcon />} label="Settings" onClick={() => setOpen(false)} />
          </div>

          {BILLING_ENABLED && (
            <>
              <div className="mx-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }} />

              <div className="py-1.5">
                <MenuLink href="/subscription" icon={<PlansIcon />} label="Plans & Usage" onClick={() => setOpen(false)} />
                <MenuButton
                  icon={<BillingIcon />}
                  label={portalLoading ? 'Opening...' : 'Manage Billing'}
                  onClick={openBillingPortal}
                  disabled={portalLoading}
                />
              </div>
            </>
          )}

          <div className="mx-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }} />

          <div className="py-1.5">
            <MenuButton
              icon={<SignOutIcon />}
              label="Sign Out"
              onClick={() => signOut({ callbackUrl: '/' })}
              danger
            />
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes menuFadeIn {
          from { opacity: 0; transform: translateY(-4px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}

function MenuLink({ href, icon, label, onClick }: { href: string; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-2 text-[13px] transition-colors duration-100"
      style={{ color: 'rgba(255,255,255,0.6)' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
        e.currentTarget.style.color = 'rgba(255,255,255,0.85)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = 'rgba(255,255,255,0.6)'
      }}
    >
      <span style={{ color: 'rgba(255,255,255,0.3)' }}>{icon}</span>
      {label}
    </Link>
  )
}

function MenuButton({ icon, label, onClick, danger, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-3 px-4 py-2 text-[13px] w-full text-left transition-colors duration-100 disabled:opacity-50"
      style={{ color: danger ? 'rgba(255,100,100,0.7)' : 'rgba(255,255,255,0.6)' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? 'rgba(255,80,80,0.08)' : 'rgba(255,255,255,0.05)'
        e.currentTarget.style.color = danger ? 'rgba(255,100,100,0.9)' : 'rgba(255,255,255,0.85)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = danger ? 'rgba(255,100,100,0.7)' : 'rgba(255,255,255,0.6)'
      }}
    >
      <span style={{ color: danger ? 'rgba(255,100,100,0.45)' : 'rgba(255,255,255,0.3)' }}>{icon}</span>
      {label}
    </button>
  )
}

// ── Inline SVG icons (16x16) ──

function UserIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function PlansIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  )
}

function BillingIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  )
}

function SignOutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}
