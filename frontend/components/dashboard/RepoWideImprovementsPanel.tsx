'use client'

import type { MultiPageTransformResult, TransformedPageData } from './TransformTypes'

const RUBRIC_LABELS: Record<string, string> = {
  layout_structure: 'Layout',
  visual_hierarchy: 'Hierarchy',
  spacing_consistency: 'Spacing',
  cta_clarity: 'CTA',
  component_quality: 'Components',
  information_density: 'Density',
}

function ScoreChip({ page }: { page: TransformedPageData }) {
  const b = page.breakdown
  return (
    <div className="group relative">
      <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
        Score: <span className="font-semibold text-white/70">{page.score}</span>/100
      </span>
      {b && (
        <div
          className="absolute left-0 top-full mt-2 z-50 hidden group-hover:block w-64 rounded-lg p-3 pointer-events-none"
          style={{ background: 'rgba(15,13,22,0.98)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 12px 40px rgba(0,0,0,0.6)' }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'rgba(168,85,247,0.7)' }}>
            Score Breakdown
          </div>
          <div className="space-y-1.5">
            {Object.entries(RUBRIC_LABELS).map(([key, label]) => {
              const v = (b as unknown as Record<string, number>)[key] ?? 0
              return (
                <div key={key} className="flex items-center gap-2 text-[10px]">
                  <span className="w-20 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</span>
                  <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-full rounded-full" style={{ width: `${v}%`, background: v >= 80 ? '#22c55e' : v >= 60 ? '#f59e0b' : '#ef4444' }} />
                  </div>
                  <span className="w-6 text-right font-mono" style={{ color: 'rgba(255,255,255,0.6)' }}>{v}</span>
                </div>
              )
            })}
          </div>
          {page.reasoning && (
            <p className="text-[10px] mt-2.5 pt-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)' }}>
              {page.reasoning}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function RepoWideImprovementsPanel({
  result,
}: {
  result: MultiPageTransformResult
}) {
  const highQualityPages = result.pages.filter(p => p.status === 'high_quality')
  const overflowPages = result.pages.filter(p => p.status === 'skipped_overflow')
  const hasGlobalSummary = result.global_summary.length > 0
  const hasHighQuality = highQualityPages.length > 0
  const hasOverflow = overflowPages.length > 0

  if (!hasGlobalSummary && !hasHighQuality && !hasOverflow) return null

  return (
    <div className="max-w-5xl mx-auto mb-8 space-y-5">
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

      {/* High-quality pages */}
      {hasHighQuality && (
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
            {highQualityPages.map(page => (
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
                  <ScoreChip page={page} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overflow pages — below threshold but skipped due to per-run cap */}
      {hasOverflow && (
        <div
          className="rounded-xl p-5"
          style={{ background: 'rgba(245,158,11,0.03)', border: '1px solid rgba(245,158,11,0.12)' }}
        >
          <div className="flex items-center gap-2 mb-4">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(245,158,11,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <h3 className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'rgba(245,158,11,0.85)' }}>
              Deferred — Need Work But Skipped This Run
            </h3>
          </div>
          <p className="text-[11px] mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
            These pages are below the quality threshold but were not processed because the per-run page limit was reached. Re-run the pipeline to transform them.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {overflowPages.map(page => (
              <div
                key={page.page_path}
                className="flex items-center gap-3 rounded-lg px-3.5 py-2.5"
                style={{ background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.1)' }}
              >
                <div
                  className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(245,158,11,0.1)' }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-white/60 truncate">{page.page_name}</p>
                  <ScoreChip page={page} />
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
