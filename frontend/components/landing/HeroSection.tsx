'use client'

import Link from 'next/link'
import FlowDemoCard from '@/components/demo/FlowDemoCard'

const BEFORE_STEPS = [
  { label: 'Navigate to Projects', target: 'sidebar:Workspace', duration: 1200 },
  { label: 'Find deploy section', target: 'nav:Settings', duration: 1000 },
  { label: 'Open settings page', target: 'card:2', duration: 1100 },
  { label: 'Locate deploy option', target: 'sidebar:Deploy', duration: 1300 },
  { label: 'Confirm deployment', target: 'modal:confirm', duration: 1400 },
]

const AFTER_STEPS = [
  { label: 'Click Deploy', target: 'cta:deploy', duration: 800 },
  { label: 'Done', target: 'card:1', duration: 600 },
]

const HERO_METRICS = [
  { label: 'Frontend churn reduced', value: '68%' },
  { label: 'Average polish time', value: '1 sprint' },
  { label: 'Behavior changes introduced', value: '0' },
]

function HeroBrowserFrame({
  children,
  label,
  accent = false,
}: {
  children: React.ReactNode
  label: string
  accent?: boolean
}) {
  return (
    <div className="flex flex-col gap-3 flex-1 min-w-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: accent ? '#8ea1ff' : 'rgba(255,255,255,0.18)' }}
          />
          <span className="text-[10px] font-semibold uppercase tracking-[0.24em]" style={{ color: 'rgba(255,255,255,0.34)' }}>
            {label}
          </span>
        </div>
        <span className="text-[10px] mono" style={{ color: 'rgba(255,255,255,0.22)' }}>
          {accent ? 'optimized flow' : 'legacy flow'}
        </span>
      </div>
      <div
        className="rounded-[22px] overflow-hidden flex flex-col"
        style={{
          border: accent ? '1px solid rgba(142,161,255,0.22)' : '1px solid rgba(255,255,255,0.08)',
          background: 'linear-gradient(180deg, rgba(8,11,18,0.96) 0%, rgba(7,9,14,0.98) 100%)',
          boxShadow: accent
            ? '0 24px 70px rgba(86,102,245,0.18)'
            : '0 24px 70px rgba(0,0,0,0.4)',
        }}
      >
        <div
          className="border-b px-4 py-2 flex items-center gap-2"
          style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <div className="w-2 h-2 rounded-full bg-red-500/45" />
          <div className="w-2 h-2 rounded-full bg-amber-500/45" />
          <div className="w-2 h-2 rounded-full bg-emerald-500/45" />
          <div className="flex-1 mx-2">
            <div
              className="rounded-md text-[9px] px-2.5 py-1 text-center mono"
              style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.2)' }}
            >
              acme-admin.vercel.app
            </div>
          </div>
        </div>
        <div className="overflow-hidden relative" style={{ height: '235px', background: '#090d15' }}>
          <div style={{ pointerEvents: 'none' }}>{children}</div>
        </div>
      </div>
    </div>
  )
}

export default function HeroSection() {
  return (
    <section className="relative pt-28 sm:pt-36 pb-20 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 65% 45% at 50% 0%, rgba(124,140,255,0.22) 0%, rgba(124,140,255,0.08) 32%, transparent 72%)',
          }}
        />
        <div
          className="absolute left-[10%] top-[18%] w-72 h-72 rounded-full"
          style={{ background: 'rgba(56,189,248,0.08)', filter: 'blur(110px)' }}
        />
        <div
          className="absolute right-[8%] top-[12%] w-80 h-80 rounded-full"
          style={{ background: 'rgba(99,102,241,0.12)', filter: 'blur(120px)' }}
        />
      </div>

      <div className="max-w-7xl mx-auto px-6 relative">
        <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-12 items-start">
          <div className="pt-8">
            <div className="eyebrow mb-6">AI-assisted redesign for live products</div>
            <h1
              className="section-title font-extrabold text-balance mb-6"
              style={{ fontSize: 'clamp(50px, 8vw, 88px)', color: '#ffffff' }}
            >
              Upgrade the interface.
              <br />
              Keep the behavior.
            </h1>
            <p
              className="max-w-xl text-balance mb-8"
              style={{ fontSize: '17px', color: 'rgba(255,255,255,0.56)', lineHeight: 1.8 }}
            >
              Reform turns inconsistent frontend surfaces into clear, production-grade UI while preserving the logic,
              event flow, and product mechanics your team already depends on.
            </p>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-10">
              <Link href="/new" className="btn-primary inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-semibold">
                Start a Redesign
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </Link>
              <Link href="/subscription" className="btn-ghost inline-flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-medium">
                View plans
              </Link>
            </div>

            <div className="grid sm:grid-cols-3 gap-3 mb-10">
              {HERO_METRICS.map((metric) => (
                <div key={metric.label} className="surface-panel rounded-2xl p-4">
                  <div className="text-2xl font-bold text-white mb-1" style={{ letterSpacing: '-0.04em' }}>
                    {metric.value}
                  </div>
                  <div className="text-[12px]" style={{ color: 'rgba(255,255,255,0.42)', lineHeight: 1.6 }}>
                    {metric.label}
                  </div>
                </div>
              ))}
            </div>

            <div className="surface-panel rounded-[28px] p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
                <div>
                  <div className="eyebrow mb-2">What changes</div>
                  <h2 className="text-xl font-semibold text-white" style={{ letterSpacing: '-0.03em' }}>Visual system, hierarchy, spacing, polish</h2>
                </div>
                <div className="mono text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  non-destructive workflow
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  'Refined navigation and content grouping',
                  'Consistent buttons, fields, cards, and chrome',
                  'Sharper typography and spacing rhythm',
                  'Premium dark surfaces with restrained contrast',
                ].map((item) => (
                  <div key={item} className="surface-interactive rounded-2xl px-4 py-3 text-sm" style={{ color: 'rgba(255,255,255,0.64)' }}>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="relative lg:pt-8">
            <div
              className="absolute inset-x-10 top-10 h-32 rounded-full"
              style={{ background: 'rgba(124,140,255,0.12)', filter: 'blur(90px)' }}
            />
            <div className="surface-panel rounded-[30px] p-4 sm:p-5 relative">
              <div className="flex items-center justify-between px-2 pb-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <div>
                  <div className="eyebrow mb-1">Transformation preview</div>
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.42)' }}>Same task, fewer steps, calmer interface.</p>
                </div>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.16)' }}>
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-[11px] font-medium" style={{ color: '#9ae6b4' }}>Ready to ship</span>
                </div>
              </div>

              <div className="grid md:grid-cols-[1fr_auto_1fr] gap-4 items-center pt-5">
                <HeroBrowserFrame label="Before">
                  <FlowDemoCard steps={BEFORE_STEPS} variant="before" caption="5 clicks to deploy" />
                </HeroBrowserFrame>

                <div className="hidden md:flex flex-col items-center gap-3 px-1">
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center"
                    style={{
                      background: 'rgba(124,140,255,0.12)',
                      border: '1px solid rgba(170,180,255,0.18)',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
                      <path d="M3 7h8M8 4l3 3-3 3" stroke="#aab4ff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <span className="mono text-[10px]" style={{ color: 'rgba(255,255,255,0.26)' }}>
                    preserved behavior
                  </span>
                </div>

                <HeroBrowserFrame label="After" accent>
                  <FlowDemoCard steps={AFTER_STEPS} variant="after" caption="1 click to deploy" />
                </HeroBrowserFrame>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
