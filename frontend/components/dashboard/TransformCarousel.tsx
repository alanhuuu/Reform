'use client'

import { useState, useEffect, useCallback } from 'react'
import type { TransformedPageData, MultiPageTransformResult } from './TransformTypes'
import { isPagePreviewAvailable, getPreviewUnavailableReason } from './TransformTypes'
import BeforeAfterShowcase from './BeforeAfterShowcase'
import StructuralChangesPanel from './StructuralChangesPanel'

export default function TransformCarousel({
  pages,
  result,
}: {
  pages: TransformedPageData[]
  result: MultiPageTransformResult
}) {
  const transformed = pages.filter(p => p.status === 'transformed')
  const [currentIndex, setCurrentIndex] = useState(0)

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
    <div className="max-w-5xl mx-auto">
      {/* Carousel navigation header */}
      <div className="flex items-center justify-between mb-5">
        {/* Page selector pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 flex-1 min-w-0">
          {transformed.map((page, i) => (
            <button
              key={page.page_path}
              onClick={() => goTo(i)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all flex-shrink-0"
              style={i === currentIndex
                ? { background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)', color: '#d8b4fe' }
                : { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)' }
              }
            >
              <span
                className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold"
                style={{
                  background: i === currentIndex ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.04)',
                  color: i === currentIndex ? '#c084fc' : 'rgba(255,255,255,0.25)',
                }}
              >
                {i + 1}
              </span>
              {page.page_name}
            </button>
          ))}
        </div>

        {/* Arrow controls */}
        {transformed.length > 1 && (
          <div className="flex items-center gap-1.5 ml-3 flex-shrink-0">
            <button
              onClick={goPrev}
              disabled={currentIndex === 0}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                opacity: currentIndex === 0 ? 0.3 : 1,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M8.5 3.5L5 7l3.5 3.5" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <span className="text-[10px] font-mono px-2" style={{ color: 'rgba(255,255,255,0.2)' }}>
              {currentIndex + 1}/{transformed.length}
            </span>
            <button
              onClick={goNext}
              disabled={currentIndex === transformed.length - 1}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                opacity: currentIndex === transformed.length - 1 ? 0.3 : 1,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5.5 3.5L9 7l-3.5 3.5" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Current slide */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: 'rgba(255,255,255,0.015)',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
        }}
      >
        {/* Slide header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.12)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l1.912 5.813a2 2 0 001.272 1.272L21 12l-5.816 1.916a2 2 0 00-1.272 1.272L12 21l-1.912-5.812a2 2 0 00-1.272-1.272L3 12l5.816-1.915a2 2 0 001.272-1.272L12 3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-white font-semibold text-[15px]">{current.page_name}</h2>
              <span className="text-[11px] font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>{current.route}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {current.score > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span className="text-[9px] font-medium uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.25)' }}>Score</span>
                <span className="text-[12px] font-bold" style={{ color: '#d8b4fe' }}>{current.score}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.12)' }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#a855f7' }} />
              <span className="text-[10px] font-medium" style={{ color: 'rgba(168,85,247,0.8)' }}>Improved</span>
            </div>
          </div>
        </div>

        {/* Diff summary callout */}
        {current.diff_summary && (
          <div
            className="mx-6 mt-5 rounded-lg px-4 py-3 flex items-start gap-2.5"
            style={{ background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.1)' }}
          >
            <svg className="mt-0.5 flex-shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(168,85,247,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l1.912 5.813a2 2 0 001.272 1.272L21 12l-5.816 1.916a2 2 0 00-1.272 1.272L12 21l-1.912-5.812a2 2 0 00-1.272-1.272L3 12l5.816-1.915a2 2 0 001.272-1.272L12 3z" />
            </svg>
            <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>{current.diff_summary}</p>
          </div>
        )}

        {/* Before/After screenshots */}
        <div className="p-6">
          <BeforeAfterShowcase
            beforeScreenshot={current.before_screenshot}
            afterScreenshot={current.after_screenshot}
            pageName={current.page_name}
            previewAvailable={isPagePreviewAvailable(current)}
            previewUnavailableReason={getPreviewUnavailableReason(result, current)}
          />
        </div>

        {/* Structural changes */}
        <div className="px-6 pb-6">
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
