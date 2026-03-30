'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { apiUrl } from '@/lib/api'

// ── Types ───────────────────────────────────────────────────────────
interface Annotation {
  id: string
  label: string
  detail: string
  type: 'positive' | 'issue' | 'warning' | 'insight'
  principle: string
  confidence: number
  zone: { x: number; y: number; w: number; h: number }
}

interface AnalysisResult {
  screenshot_b64: string
  before: { annotations: Annotation[]; ux_score: number }
  after: { annotations: Annotation[]; ux_score: number; ai_forecast: number }
  analytics: { roi: string; engagement_change: string; confidence: string; insight: string }
  after_screenshot_b64?: string
}

// ── UX Simulation data ─────────────────────────────────────────────
const DEFAULT_SCREENS = [
  { label: 'Home', route: '/' },
  { label: 'Dashboard', route: '/dashboard' },
  { label: 'Settings', route: '/settings' },
  { label: 'Pricing', route: '/pricing' },
  { label: 'Onboarding', route: '/onboarding' },
]

const HEATMAP_TYPES = [
  { key: 'attention', label: 'Attention' },
  { key: 'click', label: 'Click' },
  { key: 'scroll', label: 'Content Density' },
  { key: 'eye', label: 'Eye Tracking' },
]


// ── Annotation colours ─────────────────────────────────────────────
const ANNOTATION_COLORS = {
  positive: { pin: '#22c55e',  ring: 'rgba(34,197,94,0.25)',  border: 'rgba(34,197,94,0.5)',  zoneBorder: 'rgba(34,197,94,0.45)',  label: '#86efac' },
  issue:    { pin: '#ef4444',  ring: 'rgba(239,68,68,0.25)',   border: 'rgba(239,68,68,0.5)',   zoneBorder: 'rgba(239,68,68,0.45)',   label: '#fca5a5' },
  warning:  { pin: '#f59e0b',  ring: 'rgba(245,158,11,0.25)', border: 'rgba(245,158,11,0.5)', zoneBorder: 'rgba(245,158,11,0.45)', label: '#fcd34d' },
  insight:  { pin: '#6366f1',  ring: 'rgba(99,102,241,0.25)', border: 'rgba(99,102,241,0.5)', zoneBorder: 'rgba(99,102,241,0.45)', label: '#a5b4fc' },
}

const CARD_W = 224
const CARD_H = 116 // approximate rendered height

// ── Annotated preview ──────────────────────────────────────────────
function AnnotatedPreview({
  screenshotB64,
  annotations,
  showAnnotations,
}: {
  screenshotB64: string
  annotations: Annotation[]
  showAnnotations: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [cardPos, setCardPos] = useState<{ left: number; top: number } | null>(null)

  const hoveredAnn = annotations.find(a => a.id === hoveredId) ?? null

  const handleEnter = useCallback((ann: Annotation) => {
    setHoveredId(ann.id)
    if (!containerRef.current) return
    const { width, height } = containerRef.current.getBoundingClientRect()
    const cx = (ann.zone.x + ann.zone.w / 2) / 100 * width
    const cy = (ann.zone.y + ann.zone.h / 2) / 100 * height
    const gap = 10

    // Horizontal: prefer right of pin, flip left if it would overflow
    let left = cx + gap
    if (left + CARD_W > width) left = cx - CARD_W - gap
    left = Math.max(4, Math.min(left, width - CARD_W - 4))

    // Vertical: align top of card to pin, clamp so bottom doesn't overflow
    let top = cy - 9
    top = Math.max(4, Math.min(top, height - CARD_H - 4))

    setCardPos({ left, top })
  }, [])

  const handleLeave = useCallback(() => {
    setHoveredId(null)
    setCardPos(null)
  }, [])

  const hoveredColors = hoveredAnn
    ? (ANNOTATION_COLORS[hoveredAnn.type] ?? ANNOTATION_COLORS.insight)
    : null

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', background: '#0d0c16' }}
    >
      {/* Screenshot — clipped independently so annotations can overflow */}
      <div style={{ overflow: 'hidden', borderRadius: 'inherit' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/png;base64,${screenshotB64}`}
          alt="Page screenshot"
          style={{ width: '100%', height: 'auto', display: 'block' }}
        />
      </div>

      {/* Annotation layer — not clipped, can overflow container */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'visible', display: showAnnotations ? 'block' : 'none' }}>

        {annotations.map((ann, idx) => {
          const colors = ANNOTATION_COLORS[ann.type] ?? ANNOTATION_COLORS.insight
          const isHovered = hoveredId === ann.id
          const cx = ann.zone.x + ann.zone.w / 2
          const cy = ann.zone.y + ann.zone.h / 2

          return (
            <div key={ann.id}>
              {/* Zone bounding box */}
              <div
                onMouseEnter={() => handleEnter(ann)}
                onMouseLeave={handleLeave}
                style={{
                  position: 'absolute',
                  left: `${ann.zone.x}%`,
                  top: `${ann.zone.y}%`,
                  width: `${ann.zone.w}%`,
                  height: `${ann.zone.h}%`,
                  border: `1.5px solid ${colors.zoneBorder}`,
                  background: isHovered ? `${colors.pin}12` : 'transparent',
                  transition: 'background 0.15s',
                  cursor: 'default',
                }}
              />
              {/* Numbered pin at zone center */}
              <div
                onMouseEnter={() => handleEnter(ann)}
                onMouseLeave={handleLeave}
                style={{
                  position: 'absolute',
                  left: `${cx}%`,
                  top: `${cy}%`,
                  transform: 'translate(-50%, -50%)',
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  background: colors.pin,
                  boxShadow: `0 0 0 ${isHovered ? '5px' : '3px'} ${colors.ring}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '8px',
                  fontWeight: 800,
                  color: 'white',
                  cursor: 'default',
                  zIndex: 20,
                  transition: 'box-shadow 0.15s',
                  userSelect: 'none',
                }}
              >
                {idx + 1}
              </div>
            </div>
          )
        })}

        {/* Expanded card — rendered at container level with pixel-clamped position */}
        {hoveredAnn && hoveredColors && cardPos && (
          <div
            style={{
              position: 'absolute',
              left: cardPos.left,
              top: cardPos.top,
              width: CARD_W,
              zIndex: 50,
              background: 'rgba(13,12,22,0.97)',
              backdropFilter: 'blur(14px)',
              border: `1px solid ${hoveredColors.border}`,
              borderRadius: '10px',
              padding: '9px 11px',
              pointerEvents: 'none',
            }}
          >
            <p style={{ fontSize: '10px', fontWeight: 700, color: hoveredColors.label, marginBottom: '5px', lineHeight: 1.3 }}>
              {hoveredAnn.label}
            </p>
            <p style={{ fontSize: '10px', color: 'rgba(204,195,216,0.85)', lineHeight: 1.5, marginBottom: '6px' }}>
              {hoveredAnn.detail}
            </p>
            <p style={{ fontSize: '9px', fontWeight: 700, color: hoveredColors.label, letterSpacing: '0.05em', textTransform: 'uppercase', opacity: 0.7 }}>
              {hoveredAnn.principle} · {Math.round(hoveredAnn.confidence * 100)}%
            </p>
          </div>
        )}

      </div>
    </div>
  )
}

// ── Loading placeholder ────────────────────────────────────────────
function AnalysisLoadingWindow({ label }: { label: string }) {
  const isAfter = label === 'After'
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: isAfter ? '#a855f7' : 'rgba(255,255,255,0.2)' }} />
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(204,195,216,0.5)' }}>{label}</span>
      </div>
      <div
        className="relative rounded-xl overflow-hidden flex items-center justify-center"
        style={{
          background: '#201e2a',
          border: '1px solid rgba(74,68,85,0.15)',
          aspectRatio: '16/9',
        }}
      >
        <div className="flex flex-col items-center gap-3">
          {/* Spinner */}
          <div
            style={{
              width: '28px',
              height: '28px',
              border: '2px solid rgba(74,68,85,0.3)',
              borderTop: '2px solid #d2bbff',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <span className="text-xs font-medium" style={{ color: 'rgba(204,195,216,0.5)' }}>Running UX analysis...</span>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  )
}

// ── Empty placeholder ──────────────────────────────────────────────
function AnalysisEmptyWindow({ label }: { label: string }) {
  const isAfter = label === 'After'
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: isAfter ? '#a855f7' : 'rgba(255,255,255,0.2)' }} />
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(204,195,216,0.5)' }}>{label}</span>
      </div>
      <div
        className="relative rounded-xl overflow-hidden flex items-center justify-center"
        style={{
          background: '#201e2a',
          border: '1px solid rgba(74,68,85,0.15)',
          aspectRatio: '16/9',
        }}
      >
        <span className="text-xs" style={{ color: 'rgba(204,195,216,0.3)' }}>Select a screen to begin analysis</span>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────
export default function SimulationPage() {
  const [screens, setScreens] = useState<{ label: string; route: string }[]>(DEFAULT_SCREENS)
  const [selectedScreen, setSelectedScreen] = useState<{ label: string; route: string } | null>(null)
  const [selectedHeatmap, setSelectedHeatmap] = useState('attention')
const [loadingScreens, setLoadingScreens] = useState(true)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [loadingAnalysis, setLoadingAnalysis] = useState(false)
  const [showAnnotations, setShowAnnotations] = useState(true)
  const [showFrictionInfo, setShowFrictionInfo] = useState(false)
  const analysisCache = useRef<Record<string, AnalysisResult>>(
    (() => {
      try {
        const stored = sessionStorage.getItem('refineui_analysis_cache')
        return stored ? JSON.parse(stored) : {}
      } catch { return {} }
    })()
  )

  useEffect(() => {
    // If transform data exists, use that route as the screen
    const storedTransform = sessionStorage.getItem('refineui_transform')
    if (storedTransform) {
      try {
        const t = JSON.parse(storedTransform)
        const route = t.result?.preview_route || '/'
        const label = route === '/' ? 'Home' : route.replace(/^\//, '').replace(/\//g, ' / ').replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
        const screen = { label, route }
        setScreens([screen])
        setSelectedScreen(screen)
        setLoadingScreens(false)
        return
      } catch { /* fall through */ }
    }

    const repoUrl = sessionStorage.getItem('refineui_repo')
    if (repoUrl) {
      setLoadingScreens(true)
      fetch(`${apiUrl('/repo-pages')}?repo_url=${encodeURIComponent(repoUrl)}`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.json()
        })
        .then((data: { pages: { label: string; route: string }[] }) => {
          setScreens(data.pages)
          setSelectedScreen(data.pages[0])
        })
        .catch(() => {
          setScreens(DEFAULT_SCREENS)
          setSelectedScreen(DEFAULT_SCREENS[0])
        })
        .finally(() => {
          setLoadingScreens(false)
        })
    } else {
      setScreens(DEFAULT_SCREENS)
      setSelectedScreen(DEFAULT_SCREENS[0] ?? null)
      setLoadingScreens(false)
    }
  }, [])

  // Trigger AI analysis whenever selected screen or heatmap changes
  useEffect(() => {
    if (!selectedScreen) return

    const cacheKey = `${selectedScreen.route}:${selectedHeatmap}`
    if (analysisCache.current[cacheKey]) {
      setAnalysis(analysisCache.current[cacheKey])
      return
    }

    setLoadingAnalysis(true)
    setAnalysis(null)

    // Check if transform screenshots exist — use them for the selected route
    const storedTransform = sessionStorage.getItem('refineui_transform')
    let transformScreenshots: { before: string; after: string } | null = null
    if (storedTransform) {
      try {
        const t = JSON.parse(storedTransform)
        if (t.result?.before_screenshot && t.result?.after_screenshot) {
          transformScreenshots = { before: t.result.before_screenshot, after: t.result.after_screenshot }
        }
      } catch { /* */ }
    }

    // Use the repo URL from session or fall back to localhost
    const repoUrl = sessionStorage.getItem('refineui_repo') || ''
    const match = repoUrl.match(/github\.com\/([^/]+\/[^/]+)/)
    const repoName = match ? match[1].split('/')[1] : ''
    const deployedBase = repoName ? `https://${repoName}.vercel.app` : ''
    const targetUrl = `${deployedBase}${selectedScreen.route}`

    fetch(apiUrl('/analyze-page'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: targetUrl,
        heatmap_type: selectedHeatmap,
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<AnalysisResult>
      })
      .then((result) => {
        // If we have real transform screenshots, use them instead of the analysis screenshots
        if (transformScreenshots) {
          result.screenshot_b64 = transformScreenshots.before
          result.after_screenshot_b64 = transformScreenshots.after
        }
        analysisCache.current[cacheKey] = result
        try { sessionStorage.setItem('refineui_analysis_cache', JSON.stringify(analysisCache.current)) } catch {}
        setAnalysis(result)
      })
      .catch((err) => {
        console.error('Analysis failed:', err)
        setAnalysis(null)
      })
      .finally(() => {
        setLoadingAnalysis(false)
      })
  }, [selectedScreen, selectedHeatmap])

  const insightValue = analysis?.analytics.insight ?? null

  // Friction Index — derived entirely from Claude's annotation types
  const calcFriction = (anns: Annotation[]) => {
    if (!anns.length) return null
    const bad = anns.filter(a => a.type === 'issue' || a.type === 'warning').length
    return Math.round((bad / anns.length) * 100)
  }
  const frictionBefore = analysis ? calcFriction(analysis.before.annotations) : null
  const frictionAfter  = analysis ? calcFriction(analysis.after.annotations)  : null
  const frictionDelta  = frictionBefore !== null && frictionAfter !== null ? frictionBefore - frictionAfter : null

  const beforeScore = analysis?.before.ux_score ?? null
  const afterScore  = analysis?.after.ux_score  ?? null
  const scoreDelta  = beforeScore !== null && afterScore !== null ? afterScore - beforeScore : null

  return (
    <div className="px-8 py-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2 mt-3">
        <span className="text-xs" style={{ color: 'rgba(204,195,216,0.5)' }}>AI Predicted Metrics</span>
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight text-white mb-4">UX Lab</h1>

      <div>
        {/* Controls row */}
        <div className="flex flex-wrap items-center gap-4 mb-3">
          {/* Screen dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(204,195,216,0.4)' }}>Screen</span>
            <select
              value={selectedScreen?.label ?? ''}
              onChange={(e) => setSelectedScreen(screens.find(s => s.label === e.target.value) ?? screens[0])}
              disabled={loadingScreens}
              className="text-xs font-medium rounded-lg px-3 py-1.5 outline-none cursor-pointer"
              style={{ background: '#1c1a25', border: '1px solid rgba(74,68,85,0.3)', color: loadingScreens ? 'rgba(230,224,240,0.35)' : 'rgba(230,224,240,0.85)' }}
            >
              {loadingScreens
                ? <option value="">Loading pages...</option>
                : screens.map((s) => (
                    <option key={s.label} value={s.label}>{s.label}</option>
                  ))
              }
            </select>
          </div>

          {/* Divider */}
          <div className="w-px h-5" style={{ background: 'rgba(74,68,85,0.3)' }} />

          {/* Heatmap type pills */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(204,195,216,0.4)' }}>Analysis Mode</span>
            <div className="flex items-center gap-1 flex-wrap">
              {HEATMAP_TYPES.map((h) => (
                <button
                  key={h.key}
                  onClick={() => setSelectedHeatmap(h.key)}
                  className="px-3 py-1 rounded-full text-[11px] font-semibold transition-all"
                  style={selectedHeatmap === h.key
                    ? { background: 'rgba(124,58,237,0.3)', border: '1px solid rgba(124,58,237,0.5)', color: '#d2bbff' }
                    : { background: 'rgba(54,51,63,0.3)', border: '1px solid rgba(74,68,85,0.2)', color: 'rgba(204,195,216,0.4)' }
                  }
                >
                  {h.label}
                </button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="w-px h-5" style={{ background: 'rgba(74,68,85,0.3)' }} />

          {/* Annotations toggle */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(204,195,216,0.4)' }}>Annotations</span>
            <button
              onClick={() => setShowAnnotations(!showAnnotations)}
              className="relative flex-shrink-0 transition-all duration-200"
              style={{
                width: '36px',
                height: '20px',
                borderRadius: '10px',
                background: showAnnotations ? 'rgba(124,58,237,0.8)' : 'rgba(54,51,63,0.8)',
                border: showAnnotations ? '1px solid rgba(124,58,237,0.9)' : '1px solid rgba(74,68,85,0.4)',
              }}
            >
              <span
                className="absolute top-[2px] transition-all duration-200"
                style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  background: 'white',
                  left: showAnnotations ? '18px' : '2px',
                  display: 'block',
                }}
              />
            </button>
          </div>
        </div>

        {/* Main area */}
        <div className="space-y-4">
          {/* Side-by-side comparison windows */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              {/* Before window */}
              {loadingAnalysis ? (
                <AnalysisLoadingWindow label="Before" />
              ) : analysis ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }} />
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(204,195,216,0.5)' }}>Before</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg" style={{ background: 'rgba(15,13,24,0.6)', border: '1px solid rgba(74,68,85,0.3)' }}>
                      <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'rgba(204,195,216,0.4)' }}>UX Score</span>
                      <span className="text-xs font-black" style={{ color: '#d2bbff' }}>{analysis.before.ux_score}</span>
                    </div>
                  </div>
                  <div className="relative rounded-xl" style={{ background: '#201e2a', border: '1px solid rgba(74,68,85,0.15)' }}>
                    <AnnotatedPreview
                      screenshotB64={analysis.screenshot_b64}
                      annotations={analysis.before.annotations}
                      showAnnotations={showAnnotations}
                    />
                  </div>
                </div>
              ) : (
                <AnalysisEmptyWindow label="Before" />
              )}

              {/* After window */}
              {loadingAnalysis ? (
                <AnalysisLoadingWindow label="After" />
              ) : analysis ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#a855f7' }} />
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(204,195,216,0.5)' }}>After</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg" style={{ background: 'rgba(15,13,24,0.6)', border: '1px solid rgba(74,68,85,0.3)' }}>
                        <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'rgba(204,195,216,0.4)' }}>UX Score</span>
                        <span className="text-xs font-black" style={{ color: '#d2bbff' }}>{analysis.after.ux_score}</span>
                      </div>
                    </div>
                  </div>
                  <div className="relative rounded-xl" style={{ background: '#201e2a', border: '1px solid rgba(74,68,85,0.15)' }}>
                    <AnnotatedPreview
                      screenshotB64={analysis.after_screenshot_b64 ?? analysis.screenshot_b64}
                      annotations={analysis.after.annotations}
                      showAnnotations={showAnnotations}
                    />
                  </div>
                </div>
              ) : (
                <AnalysisEmptyWindow label="After" />
              )}
            </div>

            {/* Legend */}
            <div className="flex justify-between items-center px-1 pt-1">
              <p className="text-xs" style={{ color: 'rgba(204,195,216,0.4)' }}>
                {HEATMAP_TYPES.find(h => h.key === selectedHeatmap)?.label} · {selectedScreen?.label ?? ''}
              </p>
              <div className="flex items-center gap-3">
                {(['positive', 'warning', 'issue'] as const).map((t) => (
                  <div key={t} className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ background: ANNOTATION_COLORS[t].pin }} />
                    <span className="text-[10px] uppercase font-bold" style={{ color: 'rgba(204,195,216,0.5)' }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Stats row — below windows, horizontal layout */}
          {analysis && (
            <div className="grid grid-cols-3 gap-3">

              {/* Friction Index */}
              <div className="rounded-xl p-4" style={{ background: '#1c1a25', border: '1px solid rgba(74,68,85,0.15)' }}>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(204,195,216,0.5)' }}>Friction Index</span>
                  <div className="relative">
                    <button
                      onMouseEnter={() => setShowFrictionInfo(true)}
                      onMouseLeave={() => setShowFrictionInfo(false)}
                      className="flex items-center justify-center rounded-full text-[10px] font-bold"
                      style={{ width: '16px', height: '16px', background: 'rgba(74,68,85,0.4)', color: 'rgba(204,195,216,0.5)' }}
                    >
                      ?
                    </button>
                    {showFrictionInfo && (
                      <div className="absolute z-[200] rounded-xl p-4" style={{ width: '220px', bottom: '22px', right: '0', background: 'rgba(13,12,22,0.97)', border: '1px solid rgba(74,68,85,0.3)', backdropFilter: 'blur(12px)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
                        <p className="text-[11px] font-bold mb-2" style={{ color: '#d2bbff' }}>What is Friction Index?</p>
                        <p className="text-[10px] leading-relaxed" style={{ color: 'rgba(204,195,216,0.65)' }}>
                          Friction Index measures the proportion of UX annotations flagged as issues or warnings out of all annotations identified.
                        </p>
                        <p className="text-[10px] leading-relaxed mt-2" style={{ color: 'rgba(204,195,216,0.65)' }}>
                          A lower score means fewer friction points. The delta shows how much the proposed changes reduce friction.
                        </p>
                        <p className="text-[10px] mt-2 font-mono" style={{ color: 'rgba(204,195,216,0.35)' }}>
                          (issues + warnings) / total annotations
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                {frictionBefore !== null && frictionAfter !== null ? (
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between items-end mb-1">
                        <span className="text-[10px]" style={{ color: 'rgba(204,195,216,0.4)' }}>Before</span>
                        <span className="text-xs font-black text-white">{frictionBefore}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(54,51,63,1)' }}>
                        <div className="h-full rounded-full" style={{ width: `${frictionBefore}%`, background: 'rgba(239,68,68,0.7)' }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between items-end mb-1">
                        <span className="text-[10px]" style={{ color: 'rgba(204,195,216,0.4)' }}>After</span>
                        <span className="text-xs font-black" style={{ color: '#d2bbff' }}>{frictionAfter}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(54,51,63,1)' }}>
                        <div className="h-full rounded-full" style={{ width: `${frictionAfter}%`, background: 'rgba(124,58,237,0.7)' }} />
                      </div>
                    </div>
                    {frictionDelta !== null && (
                      <div className="flex items-center justify-between rounded-lg px-3 py-2 mt-1" style={{ background: frictionDelta > 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${frictionDelta > 0 ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(204,195,216,0.4)' }}>Reduction</span>
                        <span className="text-base font-black" style={{ color: frictionDelta > 0 ? '#86efac' : '#fca5a5' }}>
                          {frictionDelta > 0 ? '−' : '+'}{Math.abs(frictionDelta)}% pts
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px]" style={{ color: 'rgba(204,195,216,0.3)' }}>Run an analysis to see data.</p>
                )}
              </div>

              {/* UX Score */}
              <div className="rounded-xl p-4" style={{ background: '#1c1a25', border: '1px solid rgba(74,68,85,0.15)' }}>
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(204,195,216,0.5)' }}>UX Score</span>
                {beforeScore !== null && afterScore !== null ? (
                  <div className="mt-4 space-y-3">
                    {/* Delta hero */}
                    {scoreDelta !== null && (
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black" style={{ color: scoreDelta >= 0 ? '#86efac' : '#fca5a5' }}>
                          {scoreDelta >= 0 ? '+' : ''}{scoreDelta}
                        </span>
                        <span className="text-[10px] font-medium" style={{ color: 'rgba(204,195,216,0.35)' }}>pts improvement</span>
                      </div>
                    )}
                    {/* Stacked bar */}
                    <div className="relative w-full h-2 rounded-full overflow-hidden" style={{ background: 'rgba(54,51,63,1)' }}>
                      {/* Before fill */}
                      <div className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${beforeScore}%`, background: 'rgba(255,255,255,0.15)' }} />
                      {/* After fill */}
                      <div className="absolute left-0 top-0 h-full rounded-full transition-all duration-700" style={{ width: `${afterScore}%`, background: 'linear-gradient(90deg, rgba(124,58,237,0.6), #a855f7)' }} />
                    </div>
                    {/* Labels */}
                    <div className="flex justify-between">
                      <span className="text-[10px]" style={{ color: 'rgba(204,195,216,0.35)' }}>Before <span className="font-bold text-white">{beforeScore}</span></span>
                      <span className="text-[10px]" style={{ color: 'rgba(204,195,216,0.35)' }}>After <span className="font-bold" style={{ color: '#d2bbff' }}>{afterScore}</span></span>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] mt-4" style={{ color: 'rgba(204,195,216,0.3)' }}>Run an analysis to see data.</p>
                )}
              </div>

              {/* AI Insight */}
              <div className="rounded-xl p-4" style={{ background: '#1c1a25', border: '1px solid rgba(74,68,85,0.15)' }}>
                <div className="flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {/* Big star */}
                    <path d="M9 2L10.5 7.5L16 9L10.5 10.5L9 16L7.5 10.5L2 9L7.5 7.5L9 2Z" fill="rgba(168,85,247,0.9)"/>
                    {/* Small star top-right */}
                    <path d="M18 2L18.9 4.6L21.5 5.5L18.9 6.4L18 9L17.1 6.4L14.5 5.5L17.1 4.6L18 2Z" fill="rgba(168,85,247,0.7)"/>
                    {/* Small star bottom-right */}
                    <path d="M18 14L18.7 16.3L21 17L18.7 17.7L18 20L17.3 17.7L15 17L17.3 16.3L18 14Z" fill="rgba(168,85,247,0.6)"/>
                  </svg>
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(204,195,216,0.5)' }}>AI Insight</span>
                </div>
                <div className="mt-3 p-3 rounded-lg" style={{ background: 'rgba(54,51,63,0.4)' }}>
                  <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(204,195,216,0.6)' }}>
                    {insightValue ?? 'Run an analysis to see insights.'}
                  </p>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  )
}
