'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

type Status = 'success' | 'canceled' | null

export default function CheckoutResult() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<Status>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const checkout = searchParams.get('checkout')
    if (checkout === 'success' || checkout === 'canceled') {
      setStatus(checkout)
      // Trigger enter animation on next frame
      requestAnimationFrame(() => setVisible(true))
      // Clean the URL so it doesn't show again on refresh
      const url = new URL(window.location.href)
      url.searchParams.delete('checkout')
      window.history.replaceState({}, '', url.pathname + url.search)
    }
  }, [searchParams])

  function dismiss() {
    setVisible(false)
    setTimeout(() => setStatus(null), 300)
  }

  if (!status) return null

  if (status === 'canceled') {
    return (
      <div
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-sm font-medium transition-all duration-300"
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: 'rgba(255,255,255,0.6)',
          backdropFilter: 'blur(20px)',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translate(-50%, 0)' : 'translate(-50%, 12px)',
        }}
      >
        Payment was cancelled.
        <button
          onClick={dismiss}
          className="ml-3 opacity-40 hover:opacity-80 transition-opacity"
        >
          Dismiss
        </button>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center transition-all duration-300"
      style={{
        background: visible ? 'rgba(5,7,12,0.85)' : 'rgba(5,7,12,0)',
        backdropFilter: 'blur(12px)',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <div
        className="relative max-w-md w-full mx-4 p-8 sm:p-10 rounded-[32px] text-center transition-all duration-500"
        style={{
          background: 'linear-gradient(180deg, rgba(124,140,255,0.08) 0%, rgba(124,140,255,0.02) 100%)',
          border: '1px solid rgba(170,180,255,0.14)',
          boxShadow: '0 40px 120px rgba(86,102,245,0.15), 0 0 80px rgba(124,140,255,0.06)',
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(16px)',
        }}
      >
        {/* Success icon */}
        <div
          className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05))',
            border: '1px solid rgba(34,197,94,0.2)',
            boxShadow: '0 0 40px rgba(34,197,94,0.1)',
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <h2
          className="text-2xl font-bold text-white mb-2"
          style={{ letterSpacing: '-0.03em' }}
        >
          You&apos;re all set
        </h2>

        <p
          className="text-sm mb-8 leading-relaxed"
          style={{ color: 'rgba(255,255,255,0.45)' }}
        >
          Your plan is now active. You can start improving your frontend immediately.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={dismiss}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-200 active:scale-[0.97]"
            style={{
              background: 'linear-gradient(135deg, #7c8cff, #5666f5)',
              boxShadow: '0 0 30px rgba(86,102,245,0.25)',
            }}
          >
            Go to Dashboard
          </button>

          <button
            onClick={() => { dismiss(); router.push('/dashboard/discovery') }}
            className="px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 active:scale-[0.97]"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.6)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
          >
            Start your first scan
          </button>
        </div>
      </div>
    </div>
  )
}
