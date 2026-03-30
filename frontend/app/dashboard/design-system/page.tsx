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
    <div className="px-8 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <span className="text-lg font-bold" style={{ color: '#d2bbff' }}>Design Intelligence</span>
        <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase" style={{ background: 'rgba(124,58,237,0.3)', color: '#d2bbff' }}>SYNTHESIS</span>
      </div>
      <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">Synthesized Design System</h1>
      <p className="text-sm mb-8" style={{ color: 'rgba(204,195,216,0.5)' }}>
        Universal design tokens extracted and optimized through multi-competitor intelligence. A unified framework for high-performance AI interfaces.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Global Colors */}
        <div className="rounded-xl p-6" style={{ background: '#1c1a25', border: '1px solid rgba(74,68,85,0.15)' }}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-white font-bold">Global Colors</h2>
            <span className="text-xs" style={{ color: 'rgba(204,195,216,0.4)' }}>Intelligent void palette for atmospheric depth.</span>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {COLORS.map((c, i) => (
              <div key={i}>
                <div className="w-full aspect-square rounded-lg mb-2" style={{ background: c.hex, border: '1px solid rgba(74,68,85,0.2)' }} />
                <p className="text-[9px] uppercase tracking-widest font-bold" style={{ color: 'rgba(204,195,216,0.4)' }}>{c.name}</p>
                <p className="text-[10px] font-mono" style={{ color: 'rgba(204,195,216,0.6)' }}>{c.hex}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Typography Scale */}
        <div className="rounded-xl p-6" style={{ background: '#1c1a25', border: '1px solid rgba(74,68,85,0.15)' }}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-white font-bold">Typography Scale</h2>
            <span className="text-2xl font-bold" style={{ color: 'rgba(124,58,237,0.3)' }}>Tt</span>
          </div>
          <p className="text-xs mb-6" style={{ color: 'rgba(204,195,216,0.4)' }}>Inter (Display & UI Text)</p>
          <div className="space-y-6">
            {TYPE_SCALE.map((t, i) => (
              <div key={i} className="flex items-baseline justify-between" style={{ borderBottom: '1px solid rgba(74,68,85,0.08)', paddingBottom: '12px' }}>
                <div>
                  <p className="text-[9px] uppercase tracking-widest font-bold mb-1" style={{ color: 'rgba(204,195,216,0.3)' }}>{t.label}</p>
                  <p className={`text-white ${t.sizeClass}`}>{t.example}</p>
                </div>
                <p className="text-[10px] font-mono" style={{ color: 'rgba(204,195,216,0.4)' }}>{t.size}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Spacing & Radius */}
        <div className="rounded-xl p-6" style={{ background: '#1c1a25', border: '1px solid rgba(74,68,85,0.15)' }}>
          <h2 className="text-white font-bold mb-5">Spacing & Radius</h2>
          <p className="text-xs mb-4" style={{ color: 'rgba(204,195,216,0.4)' }}>Structural integrity tokens.</p>

          <p className="text-[9px] uppercase tracking-widest font-bold mb-3" style={{ color: 'rgba(204,195,216,0.3)' }}>Corner Radius</p>
          <div className="flex gap-4 mb-6">
            {['SM', 'LG', 'FULL'].map((r, i) => (
              <div key={r} className="w-16 h-16 flex items-center justify-center text-[10px] font-bold" style={{
                background: 'rgba(124,58,237,0.1)',
                border: '1px solid rgba(124,58,237,0.2)',
                borderRadius: i === 0 ? '4px' : i === 1 ? '8px' : '16px',
                color: '#d2bbff',
              }}>
                {r}
              </div>
            ))}
          </div>

          <p className="text-[9px] uppercase tracking-widest font-bold mb-3" style={{ color: 'rgba(204,195,216,0.3)' }}>Spacing Scale</p>
          <div className="flex items-end gap-2">
            {[4, 8, 12, 16, 24, 32].map((s) => (
              <div key={s} className="flex flex-col items-center gap-1">
                <div style={{ width: `${s}px`, height: `${s}px`, background: 'rgba(124,58,237,0.3)', borderRadius: '2px' }} />
                <span className="text-[9px] font-mono" style={{ color: 'rgba(204,195,216,0.3)' }}>{s}px</span>
              </div>
            ))}
          </div>
        </div>

        {/* Global UX Patterns */}
        <div className="rounded-xl p-6" style={{ background: '#1c1a25', border: '1px solid rgba(74,68,85,0.15)' }}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-white font-bold">Global UX Patterns</h2>
            <button className="text-xs px-3 py-1 rounded-lg" style={{ color: '#d2bbff', border: '1px solid rgba(74,68,85,0.3)' }}>View Blueprint</button>
          </div>
          <p className="text-xs mb-5" style={{ color: 'rgba(204,195,216,0.4)' }}>Synthesized interaction paradigms.</p>
          <div className="grid grid-cols-2 gap-4">
            {UX_PATTERNS.map((p, i) => (
              <div key={i} className="p-4 rounded-lg" style={{ background: 'rgba(15,13,24,0.5)', border: '1px solid rgba(74,68,85,0.1)' }}>
                <h4 className="text-white font-semibold text-sm mb-2">{p.name}</h4>
                <p className="text-[11px] leading-relaxed mb-3" style={{ color: 'rgba(204,195,216,0.5)' }}>{p.desc}</p>
                <div className="flex gap-1.5">
                  {p.tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 rounded text-[9px]" style={{ background: 'rgba(124,58,237,0.1)', color: '#ddb7ff', border: '1px solid rgba(124,58,237,0.2)' }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="mt-8 rounded-xl p-4 flex items-center justify-between" style={{ background: '#1c1a25', border: '1px solid rgba(74,68,85,0.15)' }}>
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full" style={{ background: '#22c55e' }} />
          <span className="text-sm" style={{ color: 'rgba(204,195,216,0.6)' }}>Design Synthesis Complete</span>
          <span className="text-xs" style={{ color: 'rgba(204,195,216,0.3)' }}>Validated against 16 competitive frameworks and 23+ heuristics.</span>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest" style={{ color: '#d2bbff', border: '1px solid rgba(74,68,85,0.3)' }}>
            Export JSON
          </button>
          <Link
            href="/dashboard/transform"
            className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #d2bbff, #7c3aed)', color: '#3f008e' }}
          >
            Push to Repository
          </Link>
        </div>
      </div>
    </div>
  )
}
