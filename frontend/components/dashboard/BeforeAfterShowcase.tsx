'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import PreviewUnavailableState from './PreviewUnavailableState'

export default function BeforeAfterShowcase({
  beforeScreenshot,
  afterScreenshot,
  pageName,
  previewAvailable = true,
  previewUnavailableReason = '',
  afterPulse = false,
}: {
  beforeScreenshot?: string
  afterScreenshot?: string
  pageName: string
  previewAvailable?: boolean
  previewUnavailableReason?: string
  afterPulse?: boolean
}) {
  const [view, setView] = useState<'split' | 'before' | 'after'>('split')
  const beforeScrollRef = useRef<HTMLDivElement | null>(null)
  const afterScrollRef = useRef<HTMLDivElement | null>(null)
  const syncingRef = useRef(false)

  const handleScroll = useCallback((source: 'before' | 'after') => {
    if (syncingRef.current) return
    const src = source === 'before' ? beforeScrollRef.current : afterScrollRef.current
    const dst = source === 'before' ? afterScrollRef.current : beforeScrollRef.current
    if (!src || !dst) return
    const srcMax = src.scrollHeight - src.clientHeight
    const dstMax = dst.scrollHeight - dst.clientHeight
    if (srcMax <= 0 || dstMax <= 0) return
    const ratio = src.scrollTop / srcMax
    syncingRef.current = true
    dst.scrollTop = ratio * dstMax
    requestAnimationFrame(() => { syncingRef.current = false })
  }, [])

  useEffect(() => {
    const before = beforeScrollRef.current
    const after = afterScrollRef.current
    if (!before || !after) return
    const onBefore = () => handleScroll('before')
    const onAfter = () => handleScroll('after')
    before.addEventListener('scroll', onBefore, { passive: true })
    after.addEventListener('scroll', onAfter, { passive: true })
    return () => {
      before.removeEventListener('scroll', onBefore)
      after.removeEventListener('scroll', onAfter)
    }
  }, [handleScroll, view])

  if (!previewAvailable) {
    return (
      <div>
        <div className="flex items-center gap-1 mb-4">
          {(['split', 'before', 'after'] as const).map(v => (
            <button key={v} disabled className="px-3 py-1 rounded-md text-[11px] font-medium cursor-not-allowed" style={{ color: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.06)' }}>
              {v === 'split' ? 'Side by Side' : v === 'before' ? 'Before' : 'After'}
            </button>
          ))}
        </div>
        <PreviewUnavailableState reason={previewUnavailableReason} />
      </div>
    )
  }

  const hasBefore = !!beforeScreenshot
  const hasAfter = !!afterScreenshot

  function ScreenshotFrame({
    label,
    screenshot,
    accent = false,
    scrollRef,
  }: {
    label: string
    screenshot?: string
    accent?: boolean
    scrollRef?: React.Ref<HTMLDivElement>
  }) {
    return (
      <div className="flex flex-col gap-2 flex-1 min-w-0">
        <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: accent ? '#8B5CF6' : 'rgba(255,255,255,0.4)' }}>
          {label}
        </span>
        <div
          className={`rounded-lg overflow-hidden transition-all duration-300${accent && afterPulse ? ' ring-1 ring-green-500/40' : ''}`}
          style={{ border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {/* Browser chrome */}
          <div className="flex items-center gap-1.5 px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="w-2 h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }} />
            <div className="w-2 h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }} />
            <div className="w-2 h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }} />
            <div className="flex-1 mx-2">
              <div className="rounded text-[9px] px-2 py-0.5 text-center" style={{ background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.25)' }}>
                {pageName.toLowerCase().replace(/ /g, '-')}.vercel.app
              </div>
            </div>
          </div>

          {/* Screenshot */}
          <div ref={scrollRef} className="overflow-y-auto" style={{ background: '#111', height: '520px' }}>
            {screenshot ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`data:image/png;base64,${screenshot}`}
                alt={`${label} — ${pageName}`}
                className="block w-full h-auto"
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.2)' }}>No preview available</p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {(hasBefore || hasAfter) && (
        <div className="flex items-center gap-1 mb-4">
          {(['split', 'before', 'after'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors duration-150"
              style={view === v
                ? { background: 'rgba(255,255,255,0.08)', color: 'white' }
                : { color: 'rgba(255,255,255,0.4)' }
              }
            >
              {v === 'split' ? 'Side by Side' : v === 'before' ? 'Before' : 'After'}
            </button>
          ))}
        </div>
      )}

      {view === 'split' ? (
        <div className="flex flex-col lg:flex-row gap-4 items-stretch">
          <ScreenshotFrame label="Before" screenshot={beforeScreenshot} scrollRef={beforeScrollRef} />
          <div className="hidden lg:flex items-center px-1">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
            </svg>
          </div>
          <ScreenshotFrame label="After" screenshot={afterScreenshot} accent scrollRef={afterScrollRef} />
        </div>
      ) : view === 'before' ? (
        <ScreenshotFrame label="Before" screenshot={beforeScreenshot} scrollRef={beforeScrollRef} />
      ) : (
        <ScreenshotFrame label="After" screenshot={afterScreenshot} accent scrollRef={afterScrollRef} />
      )}
    </div>
  )
}
