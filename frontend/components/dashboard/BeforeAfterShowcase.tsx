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
      <div className="flex flex-col gap-3 flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="w-2 h-2 rounded-full"
              style={{
                background: accent ? '#a855f7' : 'rgba(255,255,255,0.25)',
                boxShadow: accent ? '0 0 8px rgba(168,85,247,0.5)' : 'none',
              }}
            />
            <span
              className="text-[12px] font-semibold uppercase tracking-[0.15em]"
              style={{ color: accent ? 'rgba(216,180,254,0.85)' : 'rgba(255,255,255,0.5)' }}
            >
              {label}
            </span>
          </div>
        </div>
        <div
          className="rounded-2xl overflow-hidden flex flex-col"
          style={{
            border: accent ? '1px solid rgba(168,85,247,0.35)' : '1px solid rgba(255,255,255,0.08)',
            boxShadow: accent
              ? '0 0 60px rgba(124,58,237,0.18), 0 20px 60px rgba(0,0,0,0.5)'
              : '0 20px 60px rgba(0,0,0,0.5)',
          }}
        >
          {/* Browser chrome — bigger */}
          <div
            className="border-b px-4 py-2.5 flex items-center gap-2"
            style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)' }}
          >
            <div className="w-3 h-3 rounded-full bg-red-500/70" />
            <div className="w-3 h-3 rounded-full bg-amber-500/70" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/70" />
            <div className="flex-1 mx-3">
              <div className="rounded-md text-[10px] px-3 py-1 text-center" style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.3)' }}>
                {pageName.toLowerCase().replace(/ /g, '-')}.vercel.app
              </div>
            </div>
          </div>

          {/* Screenshot — capped scrollable so full-page captures stay readable */}
          <div
            className="overflow-y-auto"
            style={{ background: '#0d0c16', height: '820px' }}
          >
            {screenshot ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`data:image/png;base64,${screenshot}`}
                alt={`${label} — ${pageName}`}
                className="w-full block"
                style={{ objectFit: 'contain', objectPosition: 'top' }}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center px-6">
                  <div
                    className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center"
                    style={{
                      background: accent ? 'rgba(168,85,247,0.06)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${accent ? 'rgba(168,85,247,0.1)' : 'rgba(255,255,255,0.06)'}`,
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={accent ? 'rgba(168,85,247,0.35)' : 'rgba(255,255,255,0.2)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
                    </svg>
                  </div>
                  <p className="text-[12px] font-medium mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Preview not available</p>
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.18)' }}>Screenshot could not be captured for this page</p>
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
        <div className="flex items-center justify-center gap-1.5 mb-6">
          {(['split', 'before', 'after'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="px-4 py-2 rounded-full text-[12px] font-medium transition-all"
              style={view === v
                ? { background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.35)', color: '#d8b4fe' }
                : { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }
              }
            >
              {v === 'split' ? 'Side by Side' : v === 'before' ? 'Before Only' : 'After Only'}
            </button>
          ))}
        </div>
      )}

      {/* Screenshots */}
      {view === 'split' ? (
        <div className="flex flex-col lg:flex-row gap-6 items-stretch">
          <ScreenshotFrame label="Before" screenshot={beforeScreenshot} />
          <div className="hidden lg:flex items-center justify-center px-1">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', boxShadow: '0 0 32px rgba(124,58,237,0.45)' }}
            >
              <svg width="18" height="18" viewBox="0 0 14 14" fill="none">
                <path d="M3 7h8M8 4l3 3-3 3" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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
