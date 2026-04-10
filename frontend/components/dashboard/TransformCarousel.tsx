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
  afterPulse = false,
}: {
  pages: TransformedPageData[]
  result: MultiPageTransformResult
  onSelectedPathChange?: (path: string) => void
  afterPulse?: boolean
}) {
  const visible = pages.filter(p => p.status === 'transformed' || p.status === 'weak' || p.status === 'error')
  const transformed = visible
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    const current = transformed[currentIndex]
    if (current && onSelectedPathChange) onSelectedPathChange(current.page_path)
  }, [currentIndex, transformed, onSelectedPathChange])

  const goTo = useCallback((idx: number) => {
    setCurrentIndex(Math.max(0, Math.min(idx, transformed.length - 1)))
  }, [transformed.length])

  const goPrev = useCallback(() => goTo(currentIndex - 1), [goTo, currentIndex])
  const goNext = useCallback(() => goTo(currentIndex + 1), [goTo, currentIndex])

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
        <h3 className="text-lg font-semibold text-white mb-2">All Pages Are Already Great</h3>
        <p className="text-[13px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Every page scored above the quality threshold.
        </p>
      </div>
    )
  }

  const current = transformed[currentIndex]
  if (!current) return null

  return (
    <div className="max-w-[1760px] mx-auto px-4">
      {/* Page tabs — flat, minimal */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 flex-1 min-w-0">
          {transformed.map((page, i) => {
            const isActive = i === currentIndex
            const isError = page.status === 'error'
            const isWeak = page.status === 'weak'
            return (
              <button
                key={page.page_path}
                onClick={() => goTo(i)}
                className="px-4 py-2 rounded-md text-[13px] font-medium transition-colors duration-150 flex-shrink-0 flex items-center gap-2"
                style={isActive
                  ? { background: 'rgba(255,255,255,0.06)', color: 'white' }
                  : { color: 'rgba(255,255,255,0.45)' }
                }
              >
                {page.page_name}
                {(isError || isWeak) && (
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: isError ? '#ef4444' : '#f59e0b' }}
                  />
                )}
              </button>
            )
          })}
        </div>

        {transformed.length > 1 && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={goPrev}
              disabled={currentIndex === 0}
              className="w-8 h-8 rounded-md flex items-center justify-center transition-colors duration-150 hover:bg-white/5 disabled:opacity-25"
              style={{ border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M8.5 3.5L5 7l3.5 3.5" stroke="rgba(255,255,255,0.5)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <span className="text-[11px] font-mono px-1 tabular-nums" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {currentIndex + 1}/{transformed.length}
            </span>
            <button
              onClick={goNext}
              disabled={currentIndex === transformed.length - 1}
              className="w-8 h-8 rounded-md flex items-center justify-center transition-colors duration-150 hover:bg-white/5 disabled:opacity-25"
              style={{ border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5.5 3.5L9 7l-3.5 3.5" stroke="rgba(255,255,255,0.5)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        )}
      </div>

      {/* Current page content */}
      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
        {/* Page header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <h2 className="text-white font-semibold text-[16px] leading-tight">{current.page_name}</h2>
            <span className="text-[11px] font-mono" style={{ color: 'rgba(255,255,255,0.3)' }}>{current.route}</span>
          </div>
        </div>

        {/* Weak transformation banner */}
        {current.status === 'weak' && (
          <div className="mx-6 mt-4 rounded-md px-4 py-3 flex items-start gap-2.5" style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.12)' }}>
            <svg className="flex-shrink-0 mt-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Weak transformation — the change may be subtle. Try Refine Further.
            </p>
          </div>
        )}

        {/* Before/After */}
        {isPagePreviewAvailable(current) && (
          <div className="px-6 py-6">
            <BeforeAfterShowcase
              beforeScreenshot={current.before_screenshot}
              afterScreenshot={current.after_screenshot}
              pageName={current.page_name}
              previewAvailable={true}
              afterPulse={afterPulse}
            />
          </div>
        )}

        {/* Preview unavailable */}
        {!isPagePreviewAvailable(current) && current.status !== 'error' && (
          <div className="px-6 py-6">
            <BeforeAfterShowcase
              pageName={current.page_name}
              previewAvailable={false}
              previewUnavailableReason={getPreviewUnavailableReason(result, current)}
            />
          </div>
        )}

        {/* Diff summary */}
        {current.diff_summary && (
          <div className="mx-6 mb-4 rounded-md px-4 py-3" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>{current.diff_summary}</p>
          </div>
        )}

        {/* Structural changes */}
        <div className="px-6 pb-6">
          <StructuralChangesPanel
            annotations={current.change_annotations || []}
            changeSummary={current.change_summary || []}
          />
        </div>
      </div>
    </div>
  )
}
