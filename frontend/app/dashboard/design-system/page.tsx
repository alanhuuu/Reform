'use client'

import Link from 'next/link'

const COLORS = [
  { name: 'SURFACE', hex: '#14121D' },
  { name: 'BG SECONDARY', hex: '#072091' },
  { name: 'RECOMMENDED', hex: '#1C5A10' },
  { name: 'ACCENT', hex: '#9581FF' },
  { name: 'DANGER MIX', hex: '#0F0D18' },
  { name: 'SURFACE ALT', hex: '#2B333F' },
  { name: 'SURFACE', hex: '#0F0DB8' },
  { name: 'GLOW', hex: '#1FB445' },
]

const TYPE_SCALE = [
  { label: 'DISPLAY LG', example: 'Abc', size: 'Inter Bold - 40px / 4°', sizeClass: 'text-4xl font-bold' },
  { label: 'TITLE MD', example: 'Intelligence', size: 'Inter SemiBold - 21px', sizeClass: 'text-xl font-semibold' },
  { label: 'BODY MD', example: 'The intelligent void platform.', size: 'Inter Regular - 14px', sizeClass: 'text-sm' },
  { label: 'LABEL XS', example: 'METADATA CONTENT', size: 'Inter Bold - 10px / 5%', sizeClass: 'text-[10px] font-bold uppercase tracking-widest' },
]

const UX_PATTERNS = [
  { name: 'Tonal Architecture', desc: 'Defining space through subtle shifts in luminosity instead of rigid line borders. Reduces cognitive load during complex data synthesis.', tags: ['Low Contrast', 'Depth First'] },
  { name: 'Glass Interaction', desc: 'Floating overlays utilize background blur (20px) to maintain contextual awareness of underlying data nodes during deep-dive tasks.', tags: ['Contextual', 'Hovering'] },
  { name: 'Insight Chips', desc: 'AI-generated findings are highlighted using specialized high-contrast chips with subtle pulse animations for real-time discoveries.', tags: ['AI Signature', 'Priority 1'] },
  { name: 'Asymmetrical Grids', desc: 'Dynamic column sizing that automatically prioritizes active focus areas while maintaining high-density metadata in side rails.', tags: [] },
]

export default function DesignSystemPage() {
  return (
    <div className="px-6 py-8 max-w-7xl mx-auto">

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-sm font-bold" style={{ color: '#d2bbff' }}>Design Intelligence</span>
          <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest" style={{ background: 'rgba(124,58,237,0.3)', color: '#d2bbff' }}>SYNTHESIS</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">Synthesized Design System</h1>
            <p className="text-sm max-w-xl" style={{ color: 'rgba(204,195,216,0.55)' }}>
              Universal design tokens extracted and optimized through multi-competitor intelligence. A unified framework for high-performance AI interfaces.
            </p>
          </div>
          {/* Quick actions surfaced to top */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <button className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all hover:opacity-80" style={{ color: '#d2bbff', border: '1px solid rgba(124,58,237,0.3)', background: 'rgba(124,58,237,0.08)' }}>
              Export JSON
            </button>
            <Link
              href="/dashboard/transform"
              className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all active:scale-95 hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #d2bbff, #7c3aed)', color: '#3f008e', boxShadow: '0 0 20px rgba(124,58,237,0.25)' }}
            >
              Push to Repository
            </Link>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-3 mb-8 px-4 py-3 rounded-xl" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.12)' }}>
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#22c55e', boxShadow: '0 0 8px rgba(34,197,94,0.5)' }} />
        <span className="text-sm font-medium" style={{ color: 'rgba(134,239,172,0.9)' }}>Design Synthesis Complete</span>
        <span className="text-xs" style={{ color: 'rgba(204,195,216,0.4)' }}>Validated against 16 competitive frameworks and 23+ heuristics.</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Global Colors */}
        <div className="rounded-xl p-6" style={{ background: '#1c1a25', border: '1px solid rgba(74,68,85,0.2)' }}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-white font-bold text-base mb-0.5">Global Colors</h2>
              <p className="text-xs" style={{ color: 'rgba(204,195,216,0.4)' }}>Intelligent void palette for atmospheric depth.</p>
            </div>
            <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded" style={{ background: 'rgba(124,58,237,0.1)', color: 'rgba(204,195,216,0.4)', border: '1px solid rgba(124,58,237,0.15)' }}>8 tokens</span>
          </div>
          <div className="grid grid-cols-4 gap-4">
            {COLORS.map((c, i) => (
              <div key={i} className="group cursor-pointer">
                <div
                  className="w-full aspect-square rounded-lg mb-2 transition-transform group-hover:scale-105"
                  style={{ background: c.hex, border: '1px solid rgba(74,68,85,0.25)' }}
                />
                <p className="text-[9px] uppercase tracking-widest font-bold mb-0.5" style={{ color: 'rgba(204,195,216,0.4)' }}>{c.name}</p>
                <p className="text-[10px] font-mono" style={{ color: 'rgba(204,195,216,0.65)' }}>{c.hex}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Typography Scale */}
        <div className="rounded-xl p-6" style={{ background: '#1c1a25', border: '1px solid rgba(74,68,85,0.2)' }}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-white font-bold text-base mb-0.5">Typography Scale</h2>
              <p className="text-xs" style={{ color: 'rgba(204,195,216,0.4)' }}>Inter (Display &amp; UI Text)</p>
            </div>
            <span className="text-2xl font-bold" style={{ color: 'rgba(124,58,237,0.35)' }}>Tt</span>
          </div>
          <div className="space-y-5 mt-5">
            {TYPE_SCALE.map((t, i) => (
              <div
                key={i}
                className="flex items-baseline justify-between pb-4"
                style={{ borderBottom: '1px solid rgba(74,68,85,0.1)' }}
              >
                <div>
                  <p className="text-[9px] uppercase tracking-widest font-bold mb-1.5" style={{ color: 'rgba(204,195,216,0.35)' }}>{t.label}</p>
                  <p className={`text-white ${t.sizeClass}`}>{t.example}</p>
                </div>
                <p className="text-[10px] font-mono text-right" style={{ color: 'rgba(204,195,216,0.45)' }}>{t.size}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Spacing & Radius */}
        <div className="rounded-xl p-6" style={{ background: '#1c1a25', border: '1px solid rgba(74,68,85,0.2)' }}>
          <h2 className="text-white font-bold text-base mb-1">Spacing &amp; Radius</h2>
          <p className="text-xs mb-6" style={{ color: 'rgba(204,195,216,0.4)' }}>Structural integrity tokens.</p>

          <p className="text-[9px] uppercase tracking-widest font-bold mb-4" style={{ color: 'rgba(204,195,216,0.35)' }}>Corner Radius</p>
          <div className="flex gap-5 mb-8">
            {[
              { label: 'SM', radius: '4px' },
              { label: 'LG', radius: '8px' },
              { label: 'FULL', radius: '16px' },
            ].map(({ label, radius }) => (
              <div key={label} className="flex flex-col items-center gap-2">
                <div
                  className="w-16 h-16 flex items-center justify-center text-[10px] font-bold transition-transform hover:scale-105"
                  style={{
                    background: 'rgba(124,58,237,0.1)',
                    border: '1px solid rgba(124,58,237,0.25)',
                    borderRadius: radius,
                    color: '#d2bbff',
                  }}
                >
                  {label}
                </div>
                <span className="text-[9px] font-mono" style={{ color: 'rgba(204,195,216,0.35)' }}>{radius}</span>
              </div>
            ))}
          </div>

          <p className="text-[9px] uppercase tracking-widest font-bold mb-4" style={{ color: 'rgba(204,195,216,0.35)' }}>Spacing Scale</p>
          <div className="flex items-end gap-3">
            {[4, 8, 12, 16, 24, 32].map((s) => (
              <div key={s} className="flex flex-col items-center gap-2">
                <div
                  style={{
                    width: `${s}px`,
                    height: `${s}px`,
                    background: 'rgba(124,58,237,0.35)',
                    borderRadius: '2px',
                  }}
                />
                <span className="text-[9px] font-mono" style={{ color: 'rgba(204,195,216,0.35)' }}>{s}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Global UX Patterns */}
        <div className="rounded-xl p-6" style={{ background: '#1c1a25', border: '1px solid rgba(74,68,85,0.2)' }}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-white font-bold text-base mb-0.5">Global UX Patterns</h2>
              <p className="text-xs" style={{ color: 'rgba(204,195,216,0.4)' }}>Synthesized interaction paradigms.</p>
            </div>
            <button className="text-xs px-3 py-1.5 rounded-lg transition-all hover:opacity-80" style={{ color: '#d2bbff', border: '1px solid rgba(124,58,237,0.25)', background: 'rgba(124,58,237,0.08)' }}>
              View Blueprint
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
            {UX_PATTERNS.map((p, i) => (
              <div
                key={i}
                className="p-4 rounded-xl transition-all hover:border-opacity-30"
                style={{ background: 'rgba(15,13,24,0.6)', border: '1px solid rgba(74,68,85,0.15)' }}
              >
                <h4 className="text-white font-semibold text-sm mb-2">{p.name}</h4>
                <p className="text-[11px] leading-relaxed mb-3" style={{ color: 'rgba(204,195,216,0.5)' }}>{p.desc}</p>
                {p.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {p.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded text-[9px] font-medium"
                        style={{ background: 'rgba(124,58,237,0.12)', color: '#ddb7ff', border: '1px solid rgba(124,58,237,0.2)' }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
