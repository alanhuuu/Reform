'use client'

import { useState } from 'react'
import type { MultiPageTransformResult } from './TransformTypes'

export default function TransformSummaryHeader({
  result,
  commitResult,
  publishResult,
  onRegenerate,
}: {
  result: MultiPageTransformResult
  commitResult?: { sha: string; url: string } | null
  publishResult?: { branch_name: string; branch_url: string; files_changed: string[] } | null
  onRegenerate?: () => void | Promise<void>
}) {
  const [regenerating, setRegenerating] = useState(false)
  const improved = result.pages.filter(p => p.status === 'transformed')
  const skipped = result.pages.filter(p => p.status === 'high_quality')
  const errors = result.pages.filter(p => p.status === 'error')
  const hasPreviewErrors = result.pages.some(
    p => (p.status === 'transformed' || p.status === 'weak') && !!p.error,
  )

  async function handleClick() {
    if (!onRegenerate || regenerating) return
    setRegenerating(true)
    try {
      await onRegenerate()
    } finally {
      setRegenerating(false)
    }
  }

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
          {onRegenerate && (
            <button
              onClick={handleClick}
              disabled={regenerating}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: hasPreviewErrors ? 'rgba(245,158,11,0.1)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${hasPreviewErrors ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.1)'}`,
                color: hasPreviewErrors ? '#fbbf24' : 'rgba(255,255,255,0.7)',
              }}
              title="Clear cache and re-run the pipeline from scratch"
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={regenerating ? { animation: 'spin 1s linear infinite' } : undefined}
              >
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              <span className="text-[11px] font-medium">
                {regenerating ? 'Regenerating…' : hasPreviewErrors ? 'Regenerate (errors detected)' : 'Regenerate'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Publish banner */}
      {publishResult && (
        <div
          className="rounded-xl px-5 py-3 mb-5"
          style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              <span className="text-[12px]" style={{ color: '#86efac' }}>Changes published to GitHub</span>
              <span className="text-[11px] font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>{publishResult.branch_name}</span>
            </div>
            <a href={publishResult.branch_url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-medium" style={{ color: 'rgba(168,85,247,0.7)' }}>Open in GitHub &rarr;</a>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-[10px] font-medium" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {publishResult.files_changed.length} file{publishResult.files_changed.length !== 1 ? 's' : ''} changed
            </span>
          </div>
        </div>
      )}

      {/* Legacy commit banner */}
      {!publishResult && commitResult && (
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
