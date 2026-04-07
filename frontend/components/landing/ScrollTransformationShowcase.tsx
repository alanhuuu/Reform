'use client'

import { useEffect, useRef, useCallback } from 'react'
import MockDashboardBefore from '@/components/demo/MockDashboardBefore'
import MockDashboardAfter from '@/components/demo/MockDashboardAfter'

const NAV_HEIGHT = 72
const SCRUB_DISTANCE = 1400

function MockProductFrame({
  children,
  label,
  accent = false,
}: {
  children: React.ReactNode
  label: string
  accent?: boolean
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: accent ? '#a855f7' : 'rgba(255,255,255,0.18)' }}
          />
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'rgba(255,255,255,0.34)' }}>
            {label}
          </span>
        </div>
        <span className="mono text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
          acme-admin.vercel.app
        </span>
      </div>

      <div
        className="rounded-[28px] overflow-hidden"
        style={{
          border: accent ? '1px solid rgba(168,85,247,0.2)' : '1px solid rgba(255,255,255,0.08)',
          background: 'linear-gradient(180deg, rgba(9,12,19,0.96) 0%, rgba(6,8,13,0.98) 100%)',
          boxShadow: accent ? '0 24px 70px rgba(124,58,237,0.12)' : '0 24px 70px rgba(0,0,0,0.36)',
        }}
      >
        <div
          className="px-4 py-2.5 flex items-center gap-2 border-b"
          style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}
        >
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/45" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500/45" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/45" />
          <div className="flex-1 px-3">
            <div
              className="rounded-md text-center px-2 py-1 mono text-[9px]"
              style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.16)' }}
            >
              transformation preview
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden" style={{ aspectRatio: '16 / 10', background: '#090d15' }}>
          <div
            style={{
              width: '900px',
              height: '560px',
              transform: 'scale(0.92)',
              transformOrigin: 'top left',
              pointerEvents: 'none',
              position: 'relative',
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ScrollTransformationShowcase() {
  const sectionRef = useRef<HTMLElement>(null)
  const stickyRef = useRef<HTMLDivElement>(null)

  const applyProgress = useCallback((progress: number) => {
    const sticky = stickyRef.current
    if (!sticky) return

    const revealPct = progress * 100
    const beforeOpacity = 1 - progress * 0.28
    const afterOpacity = 0.28 + progress * 0.72

    // Update all animated elements via DOM — no React state, no re-renders
    const beforePctEl = sticky.querySelector<HTMLElement>('[data-before-pct]')
    const afterPctEl = sticky.querySelector<HTMLElement>('[data-after-pct]')
    const progressPctEl = sticky.querySelector<HTMLElement>('[data-progress-pct]')
    const progressBarEl = sticky.querySelector<HTMLElement>('[data-progress-bar]')
    const beforeTextEl = sticky.querySelector<HTMLElement>('[data-before-text]')
    const afterTextEl = sticky.querySelector<HTMLElement>('[data-after-text]')
    const afterLayerEl = sticky.querySelector<HTMLElement>('[data-after-layer]')
    const dividerEl = sticky.querySelector<HTMLElement>('[data-divider]')
    const frameEl = sticky.querySelector<HTMLElement>('[data-frame]')

    if (beforePctEl) beforePctEl.textContent = `${Math.round((1 - progress) * 100)}%`
    if (afterPctEl) afterPctEl.textContent = `${Math.round(progress * 100)}%`
    if (progressPctEl) progressPctEl.textContent = `${Math.round(progress * 100)}%`
    if (progressBarEl) progressBarEl.style.width = `${revealPct}%`
    if (beforeTextEl) beforeTextEl.style.opacity = String(beforeOpacity)
    if (afterTextEl) afterTextEl.style.opacity = String(afterOpacity)
    if (afterLayerEl) {
      afterLayerEl.style.clipPath = `inset(0 ${100 - revealPct}% 0 0)`
      afterLayerEl.style.opacity = String(afterOpacity)
    }
    if (dividerEl) dividerEl.style.left = `calc(${revealPct}% - 1px)`
    if (frameEl) {
      const accent = progress > 0.5
      frameEl.style.borderColor = accent ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.08)'
      frameEl.style.boxShadow = accent ? '0 24px 70px rgba(124,58,237,0.12)' : '0 24px 70px rgba(0,0,0,0.36)'
    }
  }, [])

  useEffect(() => {
    let ticking = false

    const onScroll = () => {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(() => {
        const section = sectionRef.current
        if (!section) { ticking = false; return }

        const rect = section.getBoundingClientRect()
        const travelled = Math.min(Math.max(-rect.top, 0), SCRUB_DISTANCE)
        applyProgress(travelled / SCRUB_DISTANCE)
        ticking = false
      })
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [applyProgress])

  return (
    <section
      ref={sectionRef}
      className="relative"
      style={{ height: `calc(100vh + ${SCRUB_DISTANCE}px)` }}
    >
      <div
        ref={stickyRef}
        className="sticky flex items-center"
        style={{
          top: `${NAV_HEIGHT}px`,
          height: `calc(100vh - ${NAV_HEIGHT}px)`,
        }}
      >
        <div className="max-w-7xl mx-auto px-6 w-full">
          <div className="surface-panel rounded-[36px] overflow-hidden">
            <div className="grid lg:grid-cols-[0.42fr_0.58fr] min-h-[76vh]">
              {/* Left column — text + progress indicators */}
              <div
                className="p-8 sm:p-10 lg:p-12 border-b lg:border-b-0 lg:border-r flex flex-col justify-between"
                style={{ borderColor: 'rgba(255,255,255,0.06)' }}
              >
                <div>
                  <div className="eyebrow mb-5">Scroll to transform</div>
                  <h2 className="section-title text-[clamp(38px,5vw,64px)] font-extrabold text-white mb-6">
                    Watch the interface move from cluttered to calm.
                  </h2>
                  <p className="max-w-md text-[15px]" style={{ color: 'rgba(255,255,255,0.5)', lineHeight: 1.85 }}>
                    This section is driven by scroll progress. The original product surface stays visible first,
                    then the refined version gradually takes over until the transformation is complete.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="surface-interactive rounded-[24px] p-5">
                    <div className="flex items-center justify-between gap-4 mb-3">
                      <span className="mono text-[11px]" style={{ color: 'rgba(255,255,255,0.28)' }}>Before</span>
                      <span data-before-pct className="text-[12px]" style={{ color: 'rgba(255,255,255,0.3)' }}>100%</span>
                    </div>
                    <p data-before-text className="text-sm" style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.75 }}>
                      Inconsistent spacing, noisier surfaces, and weaker hierarchy make the product feel harder to parse.
                    </p>
                  </div>

                  <div className="surface-interactive rounded-[24px] p-5">
                    <div className="flex items-center justify-between gap-4 mb-3">
                      <span className="mono text-[11px]" style={{ color: '#c084fc' }}>After</span>
                      <span data-after-pct className="text-[12px]" style={{ color: 'rgba(255,255,255,0.3)' }}>0%</span>
                    </div>
                    <p data-after-text className="text-sm" style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.75 }}>
                      Stronger rhythm, clearer grouping, and premium dark styling create a cleaner product story without changing the workflow.
                    </p>
                  </div>

                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="mono text-[11px]" style={{ color: 'rgba(255,255,255,0.24)' }}>Transformation progress</span>
                      <span data-progress-pct className="mono text-[11px]" style={{ color: 'rgba(255,255,255,0.24)' }}>0%</span>
                    </div>
                    <div className="h-[3px] rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <div
                        data-progress-bar
                        className="h-full rounded-full"
                        style={{
                          width: '0%',
                          background: 'linear-gradient(90deg, #7c3aed, #c084fc)',
                          boxShadow: '0 0 18px rgba(168,85,247,0.2)',
                          transition: 'width 60ms linear',
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right column — before/after visual */}
              <div className="p-5 sm:p-6 lg:p-8 flex items-center">
                <div className="w-full">
                  <MockProductFrame label="Before vs After" accent={false}>
                    {/* Before layer (always visible underneath) */}
                    <div className="absolute inset-0">
                      <MockDashboardBefore />
                    </div>

                    {/* After layer (clip-revealed on scroll) */}
                    <div
                      data-after-layer
                      className="absolute inset-0 overflow-hidden"
                      style={{ clipPath: 'inset(0 100% 0 0)', opacity: 0.28 }}
                    >
                      <MockDashboardAfter />
                    </div>

                    {/* Divider line */}
                    <div
                      data-divider
                      className="absolute inset-y-0"
                      style={{
                        left: '-1px',
                        width: '2px',
                        background: 'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(192,132,252,0.95) 15%, rgba(192,132,252,0.95) 85%, rgba(255,255,255,0) 100%)',
                        boxShadow: '0 0 24px rgba(168,85,247,0.45)',
                      }}
                    />

                    {/* Labels */}
                    <div
                      className="absolute top-4 left-4 px-3 py-1.5 rounded-full"
                      style={{ background: 'rgba(5,7,12,0.72)', border: '1px solid rgba(255,255,255,0.08)' }}
                    >
                      <span className="mono text-[10px]" style={{ color: 'rgba(255,255,255,0.36)' }}>Before</span>
                    </div>
                    <div
                      className="absolute top-4 right-4 px-3 py-1.5 rounded-full"
                      style={{ background: 'rgba(5,7,12,0.72)', border: '1px solid rgba(168,85,247,0.18)' }}
                    >
                      <span className="mono text-[10px]" style={{ color: '#d8b4fe' }}>After</span>
                    </div>
                  </MockProductFrame>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
