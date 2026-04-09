'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import FindingsShelf from '@/components/uxlab/FindingsShelf'
import { apiUrl } from '@/lib/api'
import type { Finding, FindingSeverity, FindingType, UXLabSession } from '@/types/uxlab'

interface Annotation {
  id: string
  label: string
  detail: string
  type: 'positive' | 'issue' | 'warning' | 'insight'
  principle: string
  confidence: number
  zone: { x: number; y: number; w: number; h: number }
}

const DEFAULT_SCREENS = [
  { label: 'Home', route: '/' },
  { label: 'Dashboard', route: '/dashboard' },
  { label: 'Settings', route: '/settings' },
  { label: 'Pricing', route: '/pricing' },
  { label: 'Onboarding', route: '/onboarding' },
]

const ANNOTATION_COLORS = {
  positive: { pin: '#4ade80', ring: 'rgba(74,222,128,0.28)', glow: 'rgba(74,222,128,0.55)',  border: 'rgba(34,197,94,0.5)',  zoneBorder: 'rgba(34,197,94,0.45)',  label: '#86efac' },
  issue:    { pin: '#ff5555', ring: 'rgba(255,85,85,0.28)',   glow: 'rgba(255,85,85,0.55)',   border: 'rgba(239,68,68,0.5)',  zoneBorder: 'rgba(239,68,68,0.45)', label: '#fca5a5' },
  warning:  { pin: '#fbbf24', ring: 'rgba(251,191,36,0.28)',  glow: 'rgba(251,191,36,0.55)',  border: 'rgba(245,158,11,0.5)', zoneBorder: 'rgba(245,158,11,0.45)', label: '#fcd34d' },
  insight:  { pin: '#818cf8', ring: 'rgba(129,140,248,0.28)', glow: 'rgba(129,140,248,0.55)', border: 'rgba(99,102,241,0.5)', zoneBorder: 'rgba(99,102,241,0.45)', label: '#a5b4fc' },
}

const CARD_W = 224
const CARD_H = 116

function buildAnnotationId(prefix: 'before' | 'after', route: string, annotationId: string, index: number) {
  return `${prefix}:${route}:${annotationId || index}`
}

function findingToAnnotationType(type: FindingType): Annotation['type'] {
  switch (type) {
    case 'ISSUE':
      return 'issue'
    case 'WARNING':
      return 'warning'
    default:
      return 'positive'
  }
}

function severityToConfidence(severity: FindingSeverity): number {
  switch (severity) {
    case 'critical':
      return 0.92
    case 'major':
      return 0.8
    default:
      return 0.68
  }
}

function buildZone(xPercent: number, yPercent: number) {
  const width = 18
  const height = 12
  const x = Math.max(2, Math.min(xPercent - width / 2, 98 - width))
  const y = Math.max(2, Math.min(yPercent - height / 2, 98 - height))
  return { x, y, w: width, h: height }
}

function buildAnnotationsFromFindings(
  findings: Finding[],
  prefix: 'before' | 'after',
  route: string,
): Annotation[] {
  return findings.map((finding, index) => ({
    id: buildAnnotationId(prefix, route, finding.id, index),
    label: finding.title,
    detail: finding.description,
    type: findingToAnnotationType(finding.type),
    principle: finding.principle,
    confidence: severityToConfidence(finding.severity),
    zone: buildZone(finding.annotation.xPercent, finding.annotation.yPercent),
  }))
}

function toImageSrc(image: string) {
  if (!image) return image
  return image.startsWith('data:') ? image : `data:image/png;base64,${image}`
}

async function analyzeUxLab(url: string, page: string): Promise<UXLabSession> {
  const response = await fetch(apiUrl('/api/ux-lab/analyze'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      page,
      competitor_urls: [],
      workspace_id: 'local',
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`UX Lab analysis failed (${response.status}): ${text}`)
  }

  const data = await response.json()
  return {
    id: data.id,
    url: data.url,
    page: data.page,
    beforeScreenshotUrl: data.before_screenshot_url ?? '',
    afterScreenshotUrl: data.after_screenshot_url ?? '',
    afterPreviewMessage: data.after_preview_message ?? undefined,
    findings: (data.findings ?? []).map((finding: Record<string, unknown>) => ({
      id: String(finding.id ?? ''),
      type: finding.type as FindingType,
      severity: finding.severity as FindingSeverity,
      status: (finding.status as Finding['status']) ?? 'open',
      component: String(finding.component ?? ''),
      title: String(finding.title ?? ''),
      description: String(finding.description ?? ''),
      principle: String(finding.principle ?? ''),
      principleExplanation: String(finding.principle_explanation ?? ''),
      recommendation: String(finding.recommendation ?? ''),
      requiresCompetitorEvidence: Boolean(finding.requires_competitor_evidence),
      competitorEvidence: ((finding.competitor_evidence as Record<string, unknown>[] | undefined) ?? []).map((evidence) => ({
        url: String(evidence.url ?? ''),
        screenshotUrl: String(evidence.screenshot_url ?? ''),
        annotation: String(evidence.annotation ?? ''),
      })),
      annotation: {
        xPercent: Number((finding.annotation as { xPercent?: number } | undefined)?.xPercent ?? 50),
        yPercent: Number((finding.annotation as { yPercent?: number } | undefined)?.yPercent ?? 50),
      },
    })),
    createdAt: data.created_at,
    status: data.status,
  }
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative flex-shrink-0 transition-all duration-200"
      style={{
        width: '36px',
        height: '20px',
        borderRadius: '10px',
        background: checked ? 'rgba(124,58,237,0.8)' : 'rgba(54,51,63,0.8)',
        border: checked ? '1px solid rgba(124,58,237,0.9)' : '1px solid rgba(74,68,85,0.4)',
      }}
    >
      <span
        className="absolute top-[2px] transition-all duration-200"
        style={{
          width: '14px',
          height: '14px',
          borderRadius: '50%',
          background: 'white',
          left: checked ? '18px' : '2px',
          display: 'block',
        }}
      />
    </button>
  )
}

function PreviewPlaceholder({
  title,
  message,
}: {
  title: string
  message: string
}) {
  return (
    <div
      className="flex h-full min-h-[280px] items-center justify-center px-6 text-center"
      style={{ color: 'rgba(204,195,216,0.42)' }}
    >
      <div className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'rgba(204,195,216,0.32)' }}>
          {title}
        </div>
        <div className="text-sm">{message}</div>
      </div>
    </div>
  )
}

function PreviewLoadingState({ title }: { title: string }) {
  return (
    <div className="flex h-full min-h-[280px] items-center justify-center px-6 text-center">
      <div className="space-y-3">
        <div
          style={{
            width: '28px',
            height: '28px',
            margin: '0 auto',
            border: '2px solid rgba(74,68,85,0.3)',
            borderTop: '2px solid #d2bbff',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <div className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'rgba(204,195,216,0.32)' }}>
          {title}
        </div>
        <div className="text-sm" style={{ color: 'rgba(204,195,216,0.5)' }}>
          Running UX analysis...
        </div>
        <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
      </div>
    </div>
  )
}

function AnnotatedPreview({
  screenshotB64,
  annotations,
  showAnnotations,
  activeId,
  onSelect,
  children,
}: {
  screenshotB64: string
  annotations: Annotation[]
  showAnnotations: boolean
  activeId?: string | null
  onSelect?: (id: string) => void
  children?: React.ReactNode
}) {
  const outerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [cardPos, setCardPos] = useState<{ left: number; top: number } | null>(null)
  const [imageAspect, setImageAspect] = useState<number | null>(null)
  const [frameSize, setFrameSize] = useState<{ width: number; height: number } | null>(null)

  const hoveredAnn = annotations.find((annotation) => annotation.id === hoveredId) ?? null

  useLayoutEffect(() => {
    const updateFrameSize = () => {
      if (!outerRef.current || !imageAspect) return
      const { width: availableWidth, height: availableHeight } = outerRef.current.getBoundingClientRect()
      if (!availableWidth || !availableHeight) return

      const availableAspect = availableWidth / availableHeight
      if (availableAspect > imageAspect) {
        const height = availableHeight
        const width = height * imageAspect
        setFrameSize({ width, height })
      } else {
        const width = availableWidth
        const height = width / imageAspect
        setFrameSize({ width, height })
      }
    }

    updateFrameSize()

    if (!outerRef.current) return
    const observer = new ResizeObserver(() => updateFrameSize())
    observer.observe(outerRef.current)
    return () => observer.disconnect()
  }, [imageAspect])

  const handleEnter = useCallback((annotation: Annotation) => {
    setHoveredId(annotation.id)
    if (!frameRef.current) return
    const { width, height } = frameRef.current.getBoundingClientRect()
    const cx = ((annotation.zone.x + annotation.zone.w / 2) / 100) * width
    const cy = ((annotation.zone.y + annotation.zone.h / 2) / 100) * height
    const gap = 10

    let left = cx + gap
    if (left + CARD_W > width) left = cx - CARD_W - gap
    left = Math.max(4, Math.min(left, width - CARD_W - 4))

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
      ref={outerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#0d0c16',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <div
        ref={frameRef}
        style={{
          position: 'relative',
          width: frameSize ? `${frameSize.width}px` : '100%',
          height: frameSize ? `${frameSize.height}px` : '100%',
          maxWidth: '100%',
          maxHeight: '100%',
          overflow: 'hidden',
          borderRadius: 'inherit',
          flexShrink: 0,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={toImageSrc(screenshotB64)}
          alt="Page screenshot"
          onLoad={(event) => {
            const target = event.currentTarget
            if (target.naturalWidth && target.naturalHeight) {
              setImageAspect(target.naturalWidth / target.naturalHeight)
            }
          }}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            objectFit: 'contain',
          }}
        />

        <style>{`
          @keyframes annotation-pulse {
            0%, 100% { box-shadow: 0 0 0 3px var(--pulse-ring), 0 0 5px 1px var(--pulse-glow); }
            50%       { box-shadow: 0 0 0 4px var(--pulse-ring), 0 0 7px 1px var(--pulse-glow); }
          }
        `}</style>
        <div style={{ position: 'absolute', inset: 0, overflow: 'visible', display: showAnnotations ? 'block' : 'none' }}>
        {annotations.map((annotation, index) => {
          const colors = ANNOTATION_COLORS[annotation.type] ?? ANNOTATION_COLORS.insight
          const isHovered = hoveredId === annotation.id
          const isActive = activeId === annotation.id
          const cx = annotation.zone.x + annotation.zone.w / 2
          const cy = annotation.zone.y + annotation.zone.h / 2

          return (
            <button
              key={annotation.id}
              type="button"
              aria-label={`Select annotation ${index + 1}: ${annotation.label}`}
              onClick={() => onSelect?.(annotation.id)}
              onMouseEnter={() => handleEnter(annotation)}
              onMouseLeave={handleLeave}
              style={{
                position: 'absolute',
                left: `${cx}%`,
                top: `${cy}%`,
                transform: 'translate(-50%, -50%)',
                width: '18px',
                height: '18px',
                padding: 0,
                border: 'none',
                borderRadius: '50%',
                background: colors.pin,
                boxShadow: `0 0 0 ${isHovered || isActive ? '5px' : '3px'} ${colors.ring}, 0 0 ${isHovered || isActive ? '10px' : '6px'} 1px ${colors.glow}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '8px',
                fontWeight: 800,
                color: 'white',
                cursor: onSelect ? 'pointer' : 'default',
                zIndex: 20,
                transition: 'box-shadow 0.15s',
                userSelect: 'none',
                ['--pulse-ring' as string]: colors.ring,
                ['--pulse-glow' as string]: colors.glow,
                animation: isHovered || isActive ? 'none' : 'annotation-pulse 1.6s ease-in-out infinite',
                animationDelay: `${index * 0.3}s`,
              }}
            >
              {index + 1}
            </button>
          )
        })}

        {children}

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
    </div>
  )
}

export default function SimulationPage() {
  const router = useRouter()
  const [screens, setScreens] = useState<{ label: string; route: string }[]>(DEFAULT_SCREENS)
  const [selectedScreen, setSelectedScreen] = useState<{ label: string; route: string } | null>(null)
  const [loadingScreens, setLoadingScreens] = useState(true)
  const [analysis, setAnalysis] = useState<UXLabSession | null>(null)
  const [loadingAnalysis, setLoadingAnalysis] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [showAnnotations, setShowAnnotations] = useState(true)
  const [activeFindingId, setActiveFindingId] = useState<string | null>(null)
  const [shelfExpanded, setShelfExpanded] = useState(false)
  const [pillOrder, setPillOrder] = useState<string[]>([])
  const [findings, setFindings] = useState<Finding[]>([])
  const analysisCache = useRef<Record<string, UXLabSession>>(
    (() => {
      try {
        const stored = sessionStorage.getItem('refineui_analysis_cache')
        return stored ? JSON.parse(stored) : {}
      } catch {
        return {}
      }
    })(),
  )

  useEffect(() => {
    const storedTransform = sessionStorage.getItem('refineui_transform')
    if (storedTransform) {
      try {
        const transform = JSON.parse(storedTransform)
        const route = transform.result?.preview_route || '/'
        const label = route === '/'
          ? 'Home'
          : route
              .replace(/^\//, '')
              .replace(/\//g, ' / ')
              .replace(/-/g, ' ')
              .replace(/\b\w/g, (char: string) => char.toUpperCase())
        const screen = { label, route }
        setScreens([screen])
        setSelectedScreen(screen)
        setLoadingScreens(false)
        return
      } catch {
        // Fall through to repo page discovery.
      }
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
          setSelectedScreen(data.pages[0] ?? null)
        })
        .catch(() => {
          setScreens(DEFAULT_SCREENS)
          setSelectedScreen(DEFAULT_SCREENS[0] ?? null)
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

  useEffect(() => {
    if (!selectedScreen) return

    const cacheKey = selectedScreen.route
    if (analysisCache.current[cacheKey]) {
      setAnalysisError(null)
      setAnalysis(analysisCache.current[cacheKey])
      return
    }

    setLoadingAnalysis(true)
    setAnalysisError(null)

    const repoUrl = sessionStorage.getItem('refineui_repo') || ''
    const match = repoUrl.match(/github\.com\/([^/]+\/[^/]+)/)
    const repoName = match ? match[1].split('/')[1] : ''
    const deployedBase = repoName ? `https://${repoName}.vercel.app` : ''
    const localBase = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
    const targetBase = deployedBase || localBase
    const targetUrl = `${targetBase}${selectedScreen.route}`

    analyzeUxLab(targetUrl, selectedScreen.route)
      .then((result) => {
        analysisCache.current[cacheKey] = result
        try {
          sessionStorage.setItem('refineui_analysis_cache', JSON.stringify(analysisCache.current))
        } catch {
          // Ignore cache write failures.
        }
        setAnalysis(result)
      })
      .catch((error) => {
        console.error('Analysis failed:', error)
        setAnalysis(null)
        setAnalysisError(error instanceof Error ? error.message : 'Analysis failed for this screen.')
      })
      .finally(() => {
        setLoadingAnalysis(false)
      })
  }, [selectedScreen])

  const beforeAnnotations = useMemo(
    () => buildAnnotationsFromFindings(findings, 'before', selectedScreen?.route ?? '/'),
    [findings, selectedScreen?.route],
  )
  const afterAnnotations = useMemo(
    () => buildAnnotationsFromFindings(findings, 'after', selectedScreen?.route ?? '/'),
    [findings, selectedScreen?.route],
  )

  useEffect(() => {
    const sessionFindings = analysis?.findings ?? []
    if (!sessionFindings.length) {
      setFindings([])
      setPillOrder([])
      setActiveFindingId(null)
      setShelfExpanded(false)
      return
    }

    setFindings((prev) => {
      const previousStatuses = new Map(prev.map((finding) => [finding.id, finding.status]))
      return sessionFindings.map((finding) => ({
        ...finding,
        status: previousStatuses.get(finding.id) ?? finding.status,
      }))
    })

    setPillOrder((prev) => {
      const nextIds = sessionFindings.map((finding) => finding.id)
      if (!prev.length) return nextIds
      const preserved = prev.filter((id) => nextIds.includes(id))
      const missing = nextIds.filter((id) => !preserved.includes(id))
      return [...preserved, ...missing]
    })

    setActiveFindingId((prev) => (prev && sessionFindings.some((finding) => finding.id === prev) ? prev : sessionFindings[0].id))
  }, [analysis])

  const handleSelectFinding = useCallback((findingId: string) => {
    setActiveFindingId(findingId)
    setShelfExpanded(true)
    setPillOrder((prev) => (prev.includes(findingId) ? prev : [...prev, findingId]))
  }, [])

  const handleApplyFinding = useCallback((findingId: string) => {
    if (!analysis?.id) return

    fetch(apiUrl(`/api/ux-lab/sessions/${analysis.id}/apply`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ finding_id: findingId }),
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then(() => {
        setFindings((prev) =>
          prev.map((finding) => (finding.id === findingId ? { ...finding, status: 'patched' as const } : finding)),
        )
        setAnalysis((prev) => {
          if (!prev) return prev
          const next = {
            ...prev,
            findings: prev.findings.map((finding) => (
              finding.id === findingId ? { ...finding, status: 'patched' as const } : finding
            )),
          }
          if (selectedScreen) {
            analysisCache.current[selectedScreen.route] = next
            try {
              sessionStorage.setItem('refineui_analysis_cache', JSON.stringify(analysisCache.current))
            } catch {
              // Ignore cache write failures.
            }
          }
          return next
        })
      })
      .catch((error) => {
        console.error('Failed to apply UX Lab finding:', error)
      })
  }, [analysis?.id, selectedScreen])

  const handleScrollToAnnotation = useCallback((findingId: string) => {
    const finding = findings.find((entry) => entry.id === findingId)
    if (!finding) return
    const panel = document.getElementById('before-panel')
    if (!panel) return
    panel.scrollTo({
      top: (finding.annotation.yPercent / 100) * panel.scrollHeight,
      behavior: 'smooth',
    })
  }, [findings])

  const patchedFindings = findings.filter((finding) => finding.status === 'patched')
  const shelfStatus = loadingAnalysis ? 'loading' : analysisError ? 'error' : analysis ? 'ready' : 'idle'
  const shelfStatusMessage =
    loadingAnalysis
      ? `Analyzing ${selectedScreen?.label ?? 'this screen'}. Findings will appear here when the UX Lab run finishes.`
      : analysisError
        ? `We couldn't complete analysis for ${selectedScreen?.label ?? 'this screen'}. ${analysisError}`
        : !analysis && loadingScreens
          ? 'Loading screens for this project now. The shelf will populate once a screen is ready for analysis.'
          : !analysis
            ? 'Choose a screen and run analysis to populate findings, principles, and recommendations in this shelf.'
            : undefined

  return (
    <div
      className="flex min-h-[calc(100vh-124px)] flex-col gap-1.5 px-4 py-2 sm:min-h-[calc(100vh-88px)] sm:px-8"
      style={
        {
          '--topbar-height': '88px',
          '--toolbar-height': '56px',
        } as React.CSSProperties
      }
    >
      <section className="flex min-h-[42px] items-start justify-start px-1 pt-0 pb-0.5 -mb-1">
        <div className="flex flex-col items-start justify-center text-left -translate-y-[8px]">
          <div className="text-[28px] font-mono font-medium uppercase tracking-[-0.08em] leading-none text-white scale-x-[1.24] scale-y-[0.9] origin-left">UX Lab</div>
          <p
            className="mt-1 max-w-2xl text-[14px] font-mono leading-[1.05] font-medium tracking-[-0.01em]"
            style={{ color: 'rgba(204,195,216,0.46)' }}
          >
            Instant teardown against best-in-class UX.
          </p>
        </div>
      </section>

      <section
        className="flex flex-1 flex-col overflow-hidden rounded-[28px] border"
        style={{
          background: 'rgba(16,14,24,0.92)',
          borderColor: 'rgba(255,255,255,0.07)',
          boxShadow: '0 16px 60px rgba(8,6,18,0.34)',
        }}
      >
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-5"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: 'rgba(204,195,216,0.4)' }}>
                Screen
              </span>
              <select
                value={selectedScreen?.label ?? ''}
                onChange={(event) => setSelectedScreen(screens.find((screen) => screen.label === event.target.value) ?? screens[0] ?? null)}
                disabled={loadingScreens}
                className="rounded-xl px-3 py-1.5 text-xs font-medium outline-none"
                style={{
                  background: '#1c1a25',
                  border: '1px solid rgba(74,68,85,0.3)',
                  color: loadingScreens ? 'rgba(230,224,240,0.35)' : 'rgba(230,224,240,0.85)',
                }}
              >
                {loadingScreens
                  ? <option value="">Loading pages...</option>
                  : screens.map((screen) => (
                      <option key={screen.label} value={screen.label}>{screen.label}</option>
                    ))
                }
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: 'rgba(204,195,216,0.4)' }}>
                Annotations
              </span>
              <Toggle checked={showAnnotations} onChange={setShowAnnotations} />
            </div>
            <button
              onClick={() => router.push('/dashboard/transform')}
              className="btn-primary px-4 py-2 rounded-xl text-xs font-semibold transition-all active:scale-[0.98]"
            >
              View Transformation →
            </button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
          <div
            className="canvas-panel border-b lg:border-b-0 lg:border-r"
            style={{
              flex: 1,
              borderColor: 'rgba(255,255,255,0.06)',
            }}
          >
            <div className="panel-header">
              <div className="flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }} />
                <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: 'rgba(204,195,216,0.5)' }}>
                  Before
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em]" style={{ background: 'rgba(15,13,24,0.7)', color: 'rgba(204,195,216,0.42)', border: '1px solid rgba(74,68,85,0.28)' }}>
                  {selectedScreen?.label ?? 'Screen'}
                </span>
              </div>
            </div>

            <div id="before-panel" className="panel-screenshot">
              {loadingAnalysis ? (
                <PreviewLoadingState title="Before" />
              ) : analysis ? (
                <AnnotatedPreview
                  screenshotB64={analysis.beforeScreenshotUrl}
                  annotations={beforeAnnotations}
                  showAnnotations={showAnnotations}
                  activeId={activeFindingId}
                  onSelect={handleSelectFinding}
                />
              ) : (
                <PreviewPlaceholder title="Before" message="Select a screen to begin analysis." />
              )}
            </div>
          </div>

          <div
            className="canvas-panel lg:border-l"
            style={{
              flex: 1,
              borderColor: 'rgba(168,85,247,0.08)',
            }}
          >
            <div className="panel-header">
              <div className="flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: '#a855f7' }} />
                <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: '#d2bbff' }}>
                  After
                </span>
              </div>
              <div className="flex items-center gap-2">
              </div>
            </div>

            <div className="panel-screenshot">
              {loadingAnalysis ? (
                <PreviewLoadingState title="After" />
              ) : analysis && analysis.afterScreenshotUrl ? (
                <AnnotatedPreview
                  screenshotB64={analysis.afterScreenshotUrl}
                  annotations={afterAnnotations}
                  showAnnotations={showAnnotations}
                >
                  {patchedFindings.map((finding) => (
                    <div
                      key={finding.id}
                      className="improvement-label"
                      style={{
                        left: `${finding.annotation.xPercent}%`,
                        top: `${finding.annotation.yPercent}%`,
                        transform: 'translate(-50%, -120%)',
                      }}
                    >
                      + {finding.title.toLowerCase()}
                    </div>
                  ))}
                </AnnotatedPreview>
              ) : analysis ? (
                <PreviewPlaceholder
                  title="After"
                  message={analysis.afterPreviewMessage ?? 'No modified preview screenshot is available for this run.'}
                />
              ) : (
                <PreviewPlaceholder title="After" message="Run an analysis to compare the predicted transformed experience." />
              )}
            </div>
          </div>
        </div>

        <FindingsShelf
          findings={findings}
          activeFindingId={activeFindingId}
          setActiveFindingId={setActiveFindingId}
          expanded={shelfExpanded}
          setExpanded={setShelfExpanded}
          pillOrder={pillOrder}
          setPillOrder={setPillOrder}
          onApplyFinding={handleApplyFinding}
          onScrollToAnnotation={handleScrollToAnnotation}
          status={shelfStatus}
          statusMessage={shelfStatusMessage}
        />
      </section>
    </div>
  )
}
