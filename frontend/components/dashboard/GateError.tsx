'use client'

import Link from 'next/link'

/**
 * Parse a backend error response into a structured gate error.
 * Works with both structured `{ error, message }` details and plain strings.
 */
export interface GateErrorData {
  code: string
  message: string
  currentPlan?: string
  limit?: number
  used?: number
}

const UPGRADE_CODES = new Set([
  'PLAN_LIMIT_REACHED',
  'FEATURE_NOT_AVAILABLE',
  'SUBSCRIPTION_INACTIVE',
])

const FRIENDLY_MESSAGES: Record<string, string> = {
  PLAN_LIMIT_REACHED: 'You\'ve hit your plan limit.',
  FEATURE_NOT_AVAILABLE: 'This feature isn\'t available on your current plan.',
  SUBSCRIPTION_INACTIVE: 'Your subscription is inactive.',
  AUTH_REQUIRED: 'Please sign in to continue.',
  CHECKOUT_FAILED: 'Something went wrong with checkout.',
  PAYMENT_CANCELLED: 'Payment was cancelled.',
}

/**
 * Parse an error string or fetch response detail into GateErrorData.
 * If the error string looks like a gate message from the backend, extract the code.
 * Otherwise returns null (not a gate error).
 */
export function parseGateError(detail: unknown): GateErrorData | null {
  // Structured detail from backend: { error: "CODE", message: "..." }
  if (detail && typeof detail === 'object' && 'error' in detail) {
    const d = detail as Record<string, unknown>
    const code = String(d.error ?? '')
    if (!code) return null
    return {
      code,
      message: String(d.message ?? FRIENDLY_MESSAGES[code] ?? 'Something went wrong.'),
      currentPlan: d.current_plan ? String(d.current_plan) : undefined,
      limit: typeof d.limit === 'number' ? d.limit : undefined,
      used: typeof d.used === 'number' ? d.used : undefined,
    }
  }
  return null
}

/**
 * Try to parse a fetch Response into a GateErrorData.
 * Returns null if not a structured gate error.
 */
export async function parseResponseError(res: Response): Promise<{
  gate: GateErrorData | null
  message: string
}> {
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    return { gate: null, message: `Request failed (${res.status})` }
  }

  const detail = (body as Record<string, unknown>)?.detail ?? body
  const gate = parseGateError(detail)

  if (gate) return { gate, message: gate.message }

  // Plain string detail
  if (typeof detail === 'string') return { gate: null, message: detail }

  return { gate: null, message: `Request failed (${res.status})` }
}


interface GateErrorBannerProps {
  error: GateErrorData | null
  fallbackMessage?: string
  onDismiss?: () => void
}

/**
 * Renders a gate error as a styled banner with optional upgrade prompt.
 * If error is null, renders fallbackMessage as a plain error (if provided).
 */
export default function GateErrorBanner({ error, fallbackMessage, onDismiss }: GateErrorBannerProps) {
  const message = error?.message || fallbackMessage
  if (!message) return null

  const showUpgrade = error && UPGRADE_CODES.has(error.code)

  return (
    <div
      className="rounded-xl p-4 flex items-center justify-between gap-4"
      style={{
        background: showUpgrade
          ? 'linear-gradient(135deg, rgba(124,58,237,0.08), rgba(124,58,237,0.03))'
          : 'rgba(239,68,68,0.06)',
        border: showUpgrade
          ? '1px solid rgba(124,58,237,0.15)'
          : '1px solid rgba(239,68,68,0.1)',
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background: showUpgrade ? 'rgba(124,58,237,0.1)' : 'rgba(239,68,68,0.08)',
            border: showUpgrade
              ? '1px solid rgba(124,58,237,0.15)'
              : '1px solid rgba(239,68,68,0.1)',
          }}
        >
          {showUpgrade ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(168,85,247,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[13px]" style={{ color: showUpgrade ? 'rgba(255,255,255,0.6)' : 'rgba(239,68,68,0.7)' }}>
            {message}
          </p>
          {error?.limit != null && error?.used != null && (
            <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.25)' }}>
              Used {error.used} of {error.limit}{error.currentPlan ? ` (${error.currentPlan} plan)` : ''}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {showUpgrade && (
          <Link
            href="/subscription"
            className="px-4 py-2 rounded-lg text-[12px] font-semibold text-white transition-all hover:brightness-110 active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}
          >
            Upgrade
          </Link>
        )}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/[0.04]"
            style={{ color: 'rgba(255,255,255,0.25)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
