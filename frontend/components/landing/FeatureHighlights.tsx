'use client'

import Link from 'next/link'

const HIGHLIGHTS = [
  {
    title: 'Preserve product behavior',
    body: 'Buttons, forms, navigation, and backend integrations keep working exactly as they do now. Reform focuses on presentation, not product logic.',
  },
  {
    title: 'Create a consistent design system',
    body: 'Normalize spacing, typography, cards, inputs, and shell chrome into one visual language that scales beyond a single screen.',
  },
  {
    title: 'Move from critique to implementation',
    body: 'Analyze competitor interfaces, synthesize direction, and turn that guidance into a production-ready frontend pass.',
  },
]

export default function FeatureHighlights() {
  return (
    <section className="relative pt-16 sm:pt-20 pb-32 sm:pb-40">
      <div className="max-w-7xl mx-auto px-6">

        {/* Section header */}
        <div className="mb-20 sm:mb-24">
          <div className="eyebrow mb-5">Designed for modern product teams</div>
          <h2
            className="font-extrabold text-white mb-5"
            style={{ fontSize: 'clamp(28px, 4.5vw, 48px)', letterSpacing: '-0.03em', lineHeight: 1.15 }}
          >
            High-end frontend polish
            <br />
            <span style={{ color: 'rgba(255,255,255,0.35)' }}>without a rewrite.</span>
          </h2>
          <p className="max-w-lg" style={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.8, fontSize: '15px' }}>
            Use Reform when the product already works, but the interface still feels inconsistent, dated, or
            harder to use than it should be.
          </p>
        </div>

        {/* Highlights — clean text blocks, no cards */}
        <div className="grid md:grid-cols-3 gap-12 md:gap-10 lg:gap-16 mb-28 sm:mb-32">
          {HIGHLIGHTS.map((highlight, index) => (
            <div key={highlight.title}>
              <div
                className="mono text-[11px] mb-4"
                style={{ color: 'rgba(170,180,255,0.5)' }}
              >
                0{index + 1}
              </div>
              <h3
                className="text-[17px] font-semibold text-white mb-3"
                style={{ letterSpacing: '-0.02em' }}
              >
                {highlight.title}
              </h3>
              <p className="text-[14px]" style={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.75 }}>
                {highlight.body}
              </p>
            </div>
          ))}
        </div>

        {/* Operational framing + CTA — side by side, no wrapping card */}
        <div
          className="pt-16 sm:pt-20"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="grid lg:grid-cols-[1fr_1fr] gap-16 lg:gap-24 items-start">

            {/* Left — operational details */}
            <div>
              <div className="mono text-[11px] mb-8" style={{ color: 'rgba(255,255,255,0.25)' }}>
                Operational framing
              </div>
              <div className="space-y-0">
                {[
                  ['Scope', 'Frontend redesign only'],
                  ['Backend', 'No endpoint or data-flow changes'],
                  ['Interaction model', 'Existing handlers preserved'],
                  ['Output', 'Original UI with stronger polish and hierarchy'],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between gap-6 py-4"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                  >
                    <span className="mono text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>{label}</span>
                    <span className="text-[14px] text-right" style={{ color: 'rgba(255,255,255,0.6)' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — CTA */}
            <div className="lg:pt-10">
              <p
                className="text-[22px] sm:text-[26px] font-semibold text-white mb-4"
                style={{ letterSpacing: '-0.03em', lineHeight: 1.3 }}
              >
                Make the product feel deliberate, premium, and easier to trust at first glance.
              </p>
              <p
                className="text-[14px] mb-8"
                style={{ color: 'rgba(255,255,255,0.35)', lineHeight: 1.7, maxWidth: '380px' }}
              >
                Start with a GitHub repo. Reform handles the rest — scanning, analysis, and a production-ready polish pass.
              </p>
              <Link
                href="/new"
                className="btn-primary inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold"
              >
                Start with a repo
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </Link>
            </div>

          </div>
        </div>

      </div>
    </section>
  )
}
