'use client'

import type { MultiPageTransformResult } from './TransformTypes'

export default function RepoWideImprovementsPanel({
  result,
}: {
  result: MultiPageTransformResult
}) {
  const skippedPages = result.pages.filter(p => p.status === 'high_quality')
  const hasGlobalSummary = result.global_summary.length > 0
  const hasSkipped = skippedPages.length > 0

  if (!hasGlobalSummary && !hasSkipped) return null

  return (
    <div className="max-w-5xl mx-auto mt-8 space-y-5">
      {/* Global improvements */}
      {hasGlobalSummary && (
        <div
          className="rounded-xl p-5"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center gap-2 mb-4">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(168,85,247,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
            </svg>
            <h3 className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Repo-wide Transformation Summary
            </h3>
          </div>
          <ul className="space-y-2">
            {result.global_summary.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[12px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                <svg className="mt-0.5 flex-shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(168,85,247,0.5)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Skipped pages */}
      {hasSkipped && (
        <div
          className="rounded-xl p-5"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center gap-2 mb-4">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(34,197,94,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <h3 className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Pages Already High Quality — Preserved As-Is
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {skippedPages.map(page => (
              <div
                key={page.page_path}
                className="flex items-center gap-3 rounded-lg px-3.5 py-2.5"
                style={{ background: 'rgba(34,197,94,0.03)', border: '1px solid rgba(34,197,94,0.08)' }}
              >
                <div
                  className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(34,197,94,0.08)' }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-white/60 truncate">{page.page_name}</p>
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
                    Score: {page.score}/100
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preservation notice */}
      <div
        className="rounded-lg px-4 py-3 flex items-center gap-2.5"
        style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.04)' }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
          All business logic, state management, API calls, and user interactions were preserved across every page. Only the presentation layer was upgraded.
        </p>
      </div>
    </div>
  )
}
