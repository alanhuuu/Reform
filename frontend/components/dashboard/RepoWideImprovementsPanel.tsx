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
      <span className="text-[11px] font-mono" style={{ color: 'rgba(255,255,255,0.35)' }}>
        {page.score}/100
      </span>
      {b && (
        <div
          className="absolute left-0 top-full mt-2 z-50 hidden group-hover:block w-56 rounded-md p-3 pointer-events-none"
          style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <div className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Breakdown
          </div>
          <div className="space-y-1.5">
            {Object.entries(RUBRIC_LABELS).map(([key, label]) => {
              const v = (b as unknown as Record<string, number>)[key] ?? 0
              return (
                <div key={key} className="flex items-center gap-2 text-[10px]">
                  <span className="w-16 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</span>
                  <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-full rounded-full" style={{ width: `${v}%`, background: v >= 80 ? '#22c55e' : v >= 60 ? '#f59e0b' : '#ef4444' }} />
                  </div>
                  <span className="w-5 text-right font-mono" style={{ color: 'rgba(255,255,255,0.5)' }}>{v}</span>
                </div>
              )
            })}
          </div>
          {page.reasoning && (
            <p className="text-[10px] mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>
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
    <div className="max-w-5xl mx-auto mb-8 space-y-4">
      {/* Global summary */}
      {hasGlobalSummary && (
        <div className="rounded-lg p-4" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
          <h3 className="text-[11px] font-medium uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Summary
          </h3>
          <ul className="space-y-1.5">
            {result.global_summary.map((item, i) => (
              <li key={i} className="text-[12px] flex items-start gap-2" style={{ color: 'rgba(255,255,255,0.55)' }}>
                <span style={{ color: 'rgba(255,255,255,0.2)' }}>-</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* High-quality pages */}
      {hasHighQuality && (
        <div className="rounded-lg p-4" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
          <h3 className="text-[11px] font-medium uppercase tracking-wider mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Already High Quality
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {highQualityPages.map(page => (
              <div key={page.page_path} className="flex items-center justify-between rounded-md px-3 py-2" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <span className="text-[12px] text-white/60 truncate">{page.page_name}</span>
                <ScoreChip page={page} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overflow pages */}
      {hasOverflow && (
        <div className="rounded-lg p-4" style={{ border: '1px solid rgba(245,158,11,0.12)' }}>
          <h3 className="text-[11px] font-medium uppercase tracking-wider mb-1" style={{ color: 'rgba(245,158,11,0.7)' }}>
            Deferred
          </h3>
          <p className="text-[11px] mb-3" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Below threshold but skipped due to per-run limit. Re-run to process.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {overflowPages.map(page => (
              <div key={page.page_path} className="flex items-center justify-between rounded-md px-3 py-2" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <span className="text-[12px] text-white/60 truncate">{page.page_name}</span>
                <ScoreChip page={page} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
