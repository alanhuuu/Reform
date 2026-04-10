'use client'

import type { MultiPageTransformResult } from './TransformTypes'

export default function TransformSummaryHeader({
  result,
  commitResult,
  publishResult,
}: {
  result: MultiPageTransformResult
  commitResult?: { sha: string; url: string } | null
  publishResult?: { branch_name: string; branch_url: string; files_changed: string[] } | null
}) {
  const improved = result.pages.filter(p => p.status === 'transformed')
  const skipped = result.pages.filter(p => p.status === 'high_quality')
  const errors = result.pages.filter(p => p.status === 'error')

  const stats = [
    { label: 'Pages Found', value: result.total_pages_found },
    { label: 'Improved', value: improved.length },
    { label: 'Already Great', value: skipped.length },
  ]
  if (errors.length > 0) {
    stats.push({ label: 'Errors', value: errors.length })
  }

  return (
    <div className="max-w-5xl mx-auto mb-10">
      {/* Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white tracking-tight">UI Transformation</h1>
        <p className="text-[13px] mt-1 font-mono" style={{ color: 'rgba(255,255,255,0.35)' }}>{result.repo_name}</p>
      </div>

      {/* Publish banner */}
      {publishResult && (
        <div className="rounded-lg px-4 py-3 mb-4 flex items-center justify-between" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.12)' }}>
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            <span className="text-[12px] text-white/70">Published to GitHub</span>
            <span className="text-[11px] font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>{publishResult.branch_name}</span>
          </div>
          <a href={publishResult.branch_url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-medium" style={{ color: '#8B5CF6' }}>
            View &rarr;
          </a>
        </div>
      )}

      {/* Legacy commit banner */}
      {!publishResult && commitResult && (
        <div className="rounded-lg px-4 py-3 mb-4 flex items-center justify-between" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.12)' }}>
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            <span className="text-[12px] text-white/70">Committed</span>
            <span className="text-[11px] font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>{commitResult.sha.slice(0, 7)}</span>
          </div>
          <a href={commitResult.url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-medium" style={{ color: '#8B5CF6' }}>
            View &rarr;
          </a>
        </div>
      )}

      {/* Stats row — flat, no hover effects */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {stats.map(stat => (
          <div key={stat.label} className="rounded-lg px-4 py-4" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
            <p className="text-2xl font-bold text-white tabular-nums">{stat.value}</p>
            <p className="text-[11px] font-medium mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
