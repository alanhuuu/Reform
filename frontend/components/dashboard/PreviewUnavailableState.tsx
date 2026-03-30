'use client'

/**
 * Premium empty state shown when live preview is unavailable
 * (repo not deployed, screenshots missing, render failure, etc.)
 */
export default function PreviewUnavailableState({
  reason,
}: {
  reason: string
}) {
  return (
    <div
      className="rounded-xl flex flex-col items-center justify-center text-center px-8 py-12"
      style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(124,58,237,0.02) 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
        minHeight: '280px',
      }}
    >
      {/* Icon */}
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
        style={{
          background: 'rgba(168,85,247,0.06)',
          border: '1px solid rgba(168,85,247,0.12)',
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(168,85,247,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
          <path d="M7.5 10.5l3 3 6-6" opacity="0.3" />
          <line x1="4" y1="7" x2="20" y2="17" strokeDasharray="2 3" opacity="0.5" />
        </svg>
      </div>

      {/* Title */}
      <h3 className="text-[14px] font-semibold text-white mb-2">
        Live Preview Unavailable
      </h3>

      {/* Reason */}
      <p className="text-[12px] leading-relaxed max-w-sm mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>
        {reason}
      </p>

      {/* Reassurance */}
      <div
        className="flex items-center gap-2 px-3.5 py-2 rounded-lg"
        style={{
          background: 'rgba(34,197,94,0.04)',
          border: '1px solid rgba(34,197,94,0.1)',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(34,197,94,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span className="text-[10px] font-medium" style={{ color: 'rgba(34,197,94,0.6)' }}>
          Code transformation and structural analysis are still available below
        </span>
      </div>
    </div>
  )
}
