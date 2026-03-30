'use client'

import { useState } from 'react'
import PreviewUnavailableState from './PreviewUnavailableState'

export default function BeforeAfterShowcase({
  beforeScreenshot,
  afterScreenshot,
  pageName,
  previewAvailable = true,
  previewUnavailableReason = '',
}: {
  beforeScreenshot?: string
  afterScreenshot?: string
  pageName: string
  previewAvailable?: boolean
  previewUnavailableReason?: string
}) {
  const [view, setView] = useState<'split' | 'before' | 'after'>('split')

  // If preview is explicitly unavailable, show the premium empty state
  if (!previewAvailable) {
    return (
      <div>
        {/* Disabled toggle buttons */}
        <div className="flex items-center justify-center gap-1 mb-4">
          {(['split', 'before', 'after'] as const).map(v => (
            <button
              key={v}
              disabled
              className="px-3 py-1 rounded-full text-[10px] font-medium cursor-not-allowed"
              style={{
                background: 'rgba(255,255,255,0.015)',
                border: '1px solid rgba(255,255,255,0.04)',
                color: 'rgba(255,255,255,0.15)',
              }}
            >
              {v === 'split' ? 'Side by Side' : v === 'before' ? 'Before Only' : 'After Only'}
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
  }: {
    label: string
    screenshot?: string
    accent?: boolean
  }) {
    return (
      <div className="flex flex-col gap-2 flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: accent ? '#a855f7' : 'rgba(255,255,255,0.2)' }} />
          <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</span>
        </div>
        <div
          className="rounded-xl overflow-hidden flex flex-col"
          style={{
            border: accent ? '1px solid rgba(168,85,247,0.3)' : '1px solid rgba(255,255,255,0.06)',
            boxShadow: accent ? '0 0 40px rgba(124,58,237,0.12)' : '0 12px 40px rgba(0,0,0,0.4)',
          }}
        >
          {/* Browser chrome */}
          <div
            className="border-b px-3 py-1.5 flex items-center gap-1.5"
            style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)' }}
          >
            <div className="w-2 h-2 rounded-full bg-red-500/60" />
            <div className="w-2 h-2 rounded-full bg-amber-500/60" />
            <div className="w-2 h-2 rounded-full bg-emerald-500/60" />
            <div className="flex-1 mx-2">
              <div className="rounded text-[8px] px-2 py-0.5 text-center" style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.2)' }}>
                {pageName.toLowerCase().replace(/ /g, '-')}.vercel.app
              </div>
            </div>
          </div>

          {/* Screenshot */}
          <div style={{ background: '#0d0c16', minHeight: '300px' }}>
            {screenshot ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`data:image/png;base64,${screenshot}`}
                alt={`${label} — ${pageName}`}
                className="w-full"
                style={{ objectFit: 'cover', objectPosition: 'top' }}
              />
            ) : (
              <div className="flex items-center justify-center" style={{ minHeight: '300px' }}>
                <div className="text-center px-6">
                  <div
                    className="w-10 h-10 rounded-full mx-auto mb-3 flex items-center justify-center"
                    style={{
                      background: accent ? 'rgba(168,85,247,0.06)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${accent ? 'rgba(168,85,247,0.1)' : 'rgba(255,255,255,0.06)'}`,
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent ? 'rgba(168,85,247,0.35)' : 'rgba(255,255,255,0.2)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
                    </svg>
                  </div>
                  <p className="text-[11px] font-medium mb-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Preview not available</p>
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.15)' }}>Screenshot could not be captured for this page</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* View toggle — only when at least one screenshot exists */}
      {(hasBefore || hasAfter) && (
        <div className="flex items-center justify-center gap-1 mb-4">
          {(['split', 'before', 'after'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="px-3 py-1 rounded-full text-[10px] font-medium transition-all"
              style={view === v
                ? { background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)', color: '#d8b4fe' }
                : { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' }
              }
            >
              {v === 'split' ? 'Side by Side' : v === 'before' ? 'Before Only' : 'After Only'}
            </button>
          ))}
        </div>
      )}

      {/* Screenshots */}
      {view === 'split' ? (
        <div className="flex flex-col lg:flex-row gap-4">
          <ScreenshotFrame label="Before" screenshot={beforeScreenshot} />
          <div className="hidden lg:flex items-center justify-center px-1">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', boxShadow: '0 0 20px rgba(124,58,237,0.3)' }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 7h8M8 4l3 3-3 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <ScreenshotFrame label="After" screenshot={afterScreenshot} accent />
        </div>
      ) : view === 'before' ? (
        <ScreenshotFrame label="Before" screenshot={beforeScreenshot} />
      ) : (
        <ScreenshotFrame label="After — Improved" screenshot={afterScreenshot} accent />
      )}
    </div>
  )
}
