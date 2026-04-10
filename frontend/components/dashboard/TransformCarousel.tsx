'use client'

import { useState, useEffect, useCallback } from 'react'
import type { TransformedPageData, MultiPageTransformResult } from './TransformTypes'
import { isPagePreviewAvailable, getPreviewUnavailableReason } from './TransformTypes'
import BeforeAfterShowcase from './BeforeAfterShowcase'
import StructuralChangesPanel from './StructuralChangesPanel'

export default function TransformCarousel({
  pages,
  result,
  onSelectedPathChange,
}: {
  pages: TransformedPageData[]
  result: MultiPageTransformResult
  onSelectedPathChange?: (path: string) => void
}) {
  // Include transformed, weak, AND errored pages so users can see everything.
  // High-quality and overflow pages aren't shown here — they live in their own panel.
  const visible = pages.filter(p => p.status === 'transformed' || p.status === 'weak' || p.status === 'error')
  const transformed = visible
  const [currentIndex, setCurrentIndex] = useState(0)

  // Notify parent of the initially-selected page on mount and whenever the
  // index changes — so the Refine Further modal edits the right page.
  useEffect(() => {
    const current = transformed[currentIndex]
    if (current && onSelectedPathChange) onSelectedPathChange(current.page_path)
  }, [currentIndex, transformed, onSelectedPathChange])

  const goTo = useCallback((idx: number) => {
    setCurrentIndex(Math.max(0, Math.min(idx, transformed.length - 1)))
  }, [transformed.length])

  const goPrev = useCallback(() => goTo(currentIndex - 1), [goTo, currentIndex])
  const goNext = useCallback(() => goTo(currentIndex + 1), [goTo, currentIndex])

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goPrev, goNext])

  if (transformed.length === 0) {
    return (
      <div className="max-w-4xl mx-auto text-center py-16">
        <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">All Pages Are Already Great</h3>
        <p className="text-[13px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Every page in this repository scored above the quality threshold. No transformations needed.
        </p>
      </div>
    )
  }

  const current = transformed[currentIndex]
  if (!current) return null

  return (
    <div className="max-w-[1760px] mx-auto px-4">
      {/* Carousel navigation header — large, prominent tabs */}
      <div className="flex items-start justify-between gap-4 mb-6">
        {/* Page selector tabs */}
        <div className="flex items-stretch gap-2.5 overflow-x-auto pb-2 flex-1 min-w-0">
          {transformed.map((page, i) => {
            const isActive = i === currentIndex
            const isError = page.status === 'error'
            const isWeak = page.status === 'weak'
            const accent = isError ? '239,68,68' : isWeak ? '245,158,11' : '168,85,247'
            const textActive = isError ? '#fca5a5' : isWeak ? '#fde68a' : '#d8b4fe'
            const badgeActive = isError ? '#f87171' : isWeak ? '#fbbf24' : '#c084fc'
            return (
              <button
                key={page.page_path}
                onClick={() => goTo(i)}
                className="group flex items-center gap-3 px-5 py-3.5 rounded-xl transition-all flex-shrink-0 text-left"
                style={isActive
                  ? {
                      background: `rgba(${accent},0.10)`,
                      border: `1px solid rgba(${accent},0.35)`,
                      boxShadow: `0 0 0 3px rgba(${accent},0.06), 0 4px 20px rgba(${accent},0.08)`,
                    }
                  : {
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }
                }
              >
                <span
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0 transition-all"
                  style={{
                    background: isActive ? `rgba(${accent},0.18)` : 'rgba(255,255,255,0.04)',
                    color: isActive ? badgeActive : 'rgba(255,255,255,0.35)',
                    border: isActive ? `1px solid rgba(${accent},0.25)` : '1px solid transparent',
                  }}
                >
                  {i + 1}
                </span>
                <div className="flex flex-col min-w-0">
                  <span
                    className="text-[14px] font-semibold leading-tight truncate max-w-[180px]"
                    style={{ color: isActive ? textActive : 'rgba(255,255,255,0.85)' }}
                  >
                    {page.page_name}
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: isError ? '#ef4444' : isWeak ? '#f59e0b' : '#a855f7' }}
                    />
                    <span
                      className="text-[11px] font-medium"
                      style={{ color: isActive ? `rgba(${accent},0.75)` : 'rgba(255,255,255,0.4)' }}
                    >
                      {isError ? 'Failed' : isWeak ? 'Weak' : 'Improved'}
                    </span>
                    {page.score > 0 && (
                      <>
                        <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
                        <span className="text-[11px] font-mono" style={{ color: 'rgba(255,255,255,0.4)' }}>
                          {page.score}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Arrow controls */}
        {transformed.length > 1 && (
          <div className="flex items-center gap-2 flex-shrink-0 pt-2">
            <button
              onClick={goPrev}
              disabled={currentIndex === 0}
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:bg-white/5"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                opacity: currentIndex === 0 ? 0.25 : 1,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
                <path d="M8.5 3.5L5 7l3.5 3.5" stroke="rgba(255,255,255,0.6)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <span className="text-[12px] font-mono px-1 tabular-nums" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {currentIndex + 1}/{transformed.length}
            </span>
            <button
              onClick={goNext}
              disabled={currentIndex === transformed.length - 1}
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-all hover:bg-white/5"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                opacity: currentIndex === transformed.length - 1 ? 0.25 : 1,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
                <path d="M5.5 3.5L9 7l-3.5 3.5" stroke="rgba(255,255,255,0.6)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Current slide — before/after is the hero */}
      <div
        className="rounded-3xl overflow-hidden"
        style={{
          background: 'rgba(255,255,255,0.015)',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
        }}
      >
        {/* Compact slide header */}
        <div
          className="flex items-center justify-between px-8 pt-6 pb-4"
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.12)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l1.912 5.813a2 2 0 001.272 1.272L21 12l-5.816 1.916a2 2 0 00-1.272 1.272L12 21l-1.912-5.812a2 2 0 00-1.272-1.272L3 12l5.816-1.915a2 2 0 001.272-1.272L12 3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-white font-semibold text-[18px] leading-tight">{current.page_name}</h2>
              <span className="text-[11px] font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>{current.route}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {current.score > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span className="text-[9px] font-medium uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.25)' }}>Score</span>
                <span className="text-[13px] font-bold" style={{ color: '#d8b4fe' }}>{current.score}</span>
              </div>
            )}
            {current.status === 'weak' ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.18)' }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#f59e0b', boxShadow: '0 0 6px rgba(245,158,11,0.6)' }} />
                <span className="text-[11px] font-medium" style={{ color: 'rgba(253,224,71,0.95)' }}>Weak</span>
              </div>
            ) : current.status === 'error' ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)' }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#ef4444', boxShadow: '0 0 6px rgba(239,68,68,0.6)' }} />
                <span className="text-[11px] font-medium" style={{ color: 'rgba(252,165,165,0.95)' }}>Failed</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.18)' }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#a855f7', boxShadow: '0 0 6px rgba(168,85,247,0.6)' }} />
                <span className="text-[11px] font-medium" style={{ color: 'rgba(216,180,254,0.95)' }}>Improved</span>
              </div>
            )}
          </div>
        </div>

        {/* Weak transformation banner */}
        {current.status === 'weak' && (
          <div className="mx-8 mt-2 mb-4 rounded-xl px-5 py-3.5 flex items-start gap-3" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
            <svg className="flex-shrink-0 mt-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div>
              <p className="text-[12px] font-semibold" style={{ color: '#fbbf24' }}>Weak transformation</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                The transformation engine could not produce a dramatically different result for this page. The change may be subtle. Try using &quot;Refine Further&quot; to push it further.
              </p>
            </div>
          </div>
        )}

        {/* HERO: Before/After — full-width, oversized */}
        {isPagePreviewAvailable(current) && (
          <div className="px-8 pt-2 pb-8">
            <BeforeAfterShowcase
              beforeScreenshot={current.before_screenshot}
              afterScreenshot={current.after_screenshot}
              pageName={current.page_name}
              previewAvailable={true}
            />
          </div>
        )}

        {/* Diff summary callout — under the hero */}
        {current.diff_summary && (
          <div
            className="mx-8 mb-6 rounded-xl px-5 py-4 flex items-start gap-3"
            style={{ background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.1)' }}
          >
            <svg className="mt-0.5 flex-shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(168,85,247,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l1.912 5.813a2 2 0 001.272 1.272L21 12l-5.816 1.916a2 2 0 00-1.272 1.272L12 21l-1.912-5.812a2 2 0 00-1.272-1.272L3 12l5.816-1.915a2 2 0 001.272-1.272L12 3z" />
            </svg>
            <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>{current.diff_summary}</p>
          </div>
        )}

        {/* Structural changes */}
        <div className="px-8 pb-8">
          <StructuralChangesPanel
            annotations={current.change_annotations || []}
            changeSummary={current.change_summary || []}
          />
        </div>
      </div>

      {/* Pagination dots for mobile */}
      {transformed.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-4 lg:hidden">
          {transformed.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className="rounded-full transition-all"
              style={{
                width: i === currentIndex ? '20px' : '6px',
                height: '6px',
                background: i === currentIndex ? '#a855f7' : 'rgba(255,255,255,0.15)',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
