'use client'

import type { ChangeAnnotation } from './TransformTypes'

const TYPE_COLORS: Record<string, { bg: string; text: string; accent: string }> = {
  flow: { bg: 'rgba(236,72,153,0.1)', text: 'rgba(236,72,153,0.7)', accent: 'rgba(236,72,153,0.15)' },
  layout: { bg: 'rgba(59,130,246,0.1)', text: 'rgba(59,130,246,0.7)', accent: 'rgba(59,130,246,0.15)' },
  spacing: { bg: 'rgba(34,197,94,0.1)', text: 'rgba(34,197,94,0.7)', accent: 'rgba(34,197,94,0.15)' },
  component: { bg: 'rgba(245,158,11,0.1)', text: 'rgba(245,158,11,0.7)', accent: 'rgba(245,158,11,0.15)' },
  visual: { bg: 'rgba(168,85,247,0.1)', text: 'rgba(168,85,247,0.7)', accent: 'rgba(168,85,247,0.15)' },
}
const TYPE_ORDER = ['flow', 'layout', 'spacing', 'component', 'visual']

export default function StructuralChangesPanel({
  annotations,
  changeSummary,
}: {
  annotations: ChangeAnnotation[]
  changeSummary: string[]
}) {
  if (!annotations.length && !changeSummary.length) return null

  // Group annotations by type
  const grouped = TYPE_ORDER
    .map(type => ({ type, items: annotations.filter(a => a.change_type === type) }))
    .filter(g => g.items.length > 0)
  const knownTypes = new Set(TYPE_ORDER)
  const extras = annotations.filter(a => !knownTypes.has(a.change_type))
  if (extras.length > 0) grouped.push({ type: 'other', items: extras })

  // Collect unique improvement tags
  const tags = [...new Set(annotations.map(a => a.change_type).filter(Boolean))]

  return (
    <div className="space-y-4 mt-5">
      {/* Improvement tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map(tag => {
            const colors = TYPE_COLORS[tag] || TYPE_COLORS.visual
            return (
              <span
                key={tag}
                className="text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full"
                style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.accent}` }}
              >
                {tag}
              </span>
            )
          })}
        </div>
      )}

      {/* Change summary bullets */}
      {changeSummary.length > 0 && (
        <ul className="space-y-2">
          {changeSummary.slice(0, 5).map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-[12px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
              <svg className="mt-0.5 flex-shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(34,197,94,0.5)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {item}
            </li>
          ))}
        </ul>
      )}

      {/* Detailed annotations (collapsed if many) */}
      {grouped.length > 0 && (
        <div
          className="rounded-lg p-4 space-y-4"
          style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.04)' }}
        >
          <h4 className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.25)' }}>
            Detailed Changes
          </h4>
          {grouped.map(group => {
            const colors = TYPE_COLORS[group.type] || TYPE_COLORS.visual
            return (
              <div key={group.type}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: colors.bg, color: colors.text }}>
                    {group.type}
                  </span>
                  <div className="flex-1 h-px" style={{ background: colors.accent }} />
                </div>
                <div className="space-y-1.5">
                  {group.items.map((ann, i) => (
                    <div key={i} className="pl-3" style={{ borderLeft: `2px solid ${colors.accent}` }}>
                      <p className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>{ann.region}</p>
                      <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{ann.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
