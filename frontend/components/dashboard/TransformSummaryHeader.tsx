'use client'

import type { MultiPageTransformResult } from './TransformTypes'

export default function TransformSummaryHeader({
  result,
  commitResult,
}: {
  result: MultiPageTransformResult
  commitResult?: { sha: string; url: string } | null
}) {
  const improved = result.pages.filter(p => p.status === 'transformed')
  const skipped = result.pages.filter(p => p.status === 'high_quality')
  const errors = result.pages.filter(p => p.status === 'error')

  const stats = [
    { label: 'Pages Found', value: result.total_pages_found, color: '#ffffff' },
    { label: 'Improved', value: improved.length, color: '#a855f7' },
    { label: 'Already Great', value: skipped.length, color: '#22c55e' },
  ]
  if (errors.length > 0) {
    stats.push({ label: 'Errors', value: errors.length, color: '#ef4444' })
  }

  return (
    <div className="max-w-5xl mx-auto mb-8">
      {/* Title row */}
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold text-white mb-2">UI Transformation</h1>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <div
            className="flex items-center gap-1.5 px-3 py-1 rounded-full"
            style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.15)' }}
          >
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#a855f7', boxShadow: '0 0 6px rgba(168,85,247,0.4)' }} />
            <span className="text-[11px] font-medium" style={{ color: 'rgba(168,85,247,0.8)' }}>
              Repo-wide Analysis Complete
            </span>
          </div>
          <span className="text-[12px] font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>{result.repo_name}</span>
        </div>
      </div>

      {/* Commit banner */}
      {commitResult && (
        <div
          className="rounded-xl px-5 py-3 mb-5 flex items-center justify-between"
          style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}
        >
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            <span className="text-[12px]" style={{ color: '#86efac' }}>Changes committed to GitHub</span>
            <span className="text-[11px] font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>{commitResult.sha.slice(0, 7)}</span>
          </div>
          <a href={commitResult.url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-medium" style={{ color: 'rgba(168,85,247,0.7)' }}>View commit &rarr;</a>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {stats.map(stat => (
          <div
            key={stat.label}
            className="group relative rounded-xl px-5 py-5 text-center transition-all duration-200 cursor-default"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(124,58,237,0.03) 100%)',
              border: '1px solid rgba(124,58,237,0.2)',
              boxShadow: '0 2px 12px rgba(0,0,0,0.25), 0 0 20px rgba(124,58,237,0.04)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-3px)'
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.35), 0 0 30px rgba(124,58,237,0.1)'
              e.currentTarget.style.borderColor = 'rgba(124,58,237,0.35)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.25), 0 0 20px rgba(124,58,237,0.04)'
              e.currentTarget.style.borderColor = 'rgba(124,58,237,0.2)'
            }}
          >
            {/* Top accent line */}
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-10 rounded-full"
              style={{ background: `linear-gradient(90deg, transparent, ${stat.color}, transparent)`, opacity: 0.6 }}
            />
            <p className="text-3xl font-extrabold mb-1.5 tracking-tight" style={{ color: stat.color }}>{stat.value}</p>
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.4)' }}>{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
