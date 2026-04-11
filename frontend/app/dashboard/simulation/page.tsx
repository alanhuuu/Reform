'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import FindingsShelf from '@/components/uxlab/FindingsShelf'
import { apiUrl } from '@/lib/api'
import { getSelectedRepo, setSelectedRepo } from '@/lib/selectedRepo'
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


const ANALYSIS_STAGES: { message: string; duration: number }[] = [
  { message: 'Cloning repository',         duration: 15_000 },
  { message: 'Installing dependencies',    duration: 90_000 },
  { message: 'Starting dev server',        duration: 30_000 },
  { message: 'Capturing screenshot',       duration: 15_000 },
  { message: 'Analyzing layout patterns',  duration: 20_000 },
  { message: 'Identifying UX issues',      duration: 15_000 },
  { message: 'Generating recommendations', duration: 10_000 },
  { message: 'Finalizing...',              duration: Infinity },
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
    detail: finding.recommendation,
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

async function analyzeUxLab(
  repoUrl: string,
  branch: string,
  page: string,
  accessToken: string,
  workspaceId: string,
  signal?: AbortSignal,
): Promise<UXLabSession> {
  const response = await fetch(apiUrl('/api/ux-lab/analyze'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      repo_url: repoUrl,
      branch,
      page,
      access_token: accessToken,
      workspace_id: workspaceId,
      analysis_only: true,
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

const SKELETON_COLOR = 'rgba(255,255,255,0.06)'
const SKELETON_GRADIENT = 'linear-gradient(90deg, rgba(255,255,255,0.04), rgba(167,139,250,0.12), rgba(255,255,255,0.04))'

function SkeletonBlock({ width = '100%', height, delay = 0 }: { width?: string; height: string; delay?: number }) {
  return (
    <div
      className="ai-shimmer"
      style={{
        width,
        height,
        borderRadius: '4px',
        background: SKELETON_GRADIENT,
        backgroundSize: '200% 100%',
        animationDelay: `${delay}ms`,
      }}
    />
  )
}

function PreviewLoadingState({ stage, progress }: { title: string; stage?: string; progress?: number }) {
  return (
    <div style={{ width: '100%', height: '100%', minHeight: '280px', padding: '0', display: 'flex', flexDirection: 'column', background: '#0d0c16' }}>
      {/* Nav bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: `1px solid ${SKELETON_COLOR}` }}>
        <SkeletonBlock width="72px" height="12px" />
        <div style={{ display: 'flex', gap: '10px' }}>
          <SkeletonBlock width="40px" height="8px" delay={80} />
          <SkeletonBlock width="40px" height="8px" delay={140} />
          <SkeletonBlock width="40px" height="8px" delay={200} />
        </div>
        <SkeletonBlock width="56px" height="24px" delay={100} />
      </div>

      {/* Hero — replaced with inline status */}
      <div style={{ padding: '28px 20px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="status-dot-pulse" style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(168,85,247,0.7)', display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(204,195,216,0.55)', letterSpacing: '0.02em' }}>
            {stage ?? 'Initializing…'}
          </span>
        </div>
        <div style={{ width: '40%', height: 2, borderRadius: 999, background: 'rgba(255,255,255,0.05)' }}>
          <div style={{
            height: '100%', borderRadius: 999,
            background: 'linear-gradient(90deg, rgba(124,58,237,0.6), rgba(168,85,247,0.6))',
            width: `${progress ?? 0}%`,
            transition: progress === 100 ? 'width 300ms ease-out' : 'width 150ms linear',
          }} />
        </div>
      </div>

      {/* Content rows */}
      <div style={{ flex: 1, padding: '4px 20px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <SkeletonBlock width="100%" height="72px" delay={100} />
        <div style={{ display: 'flex', gap: '10px' }}>
          <SkeletonBlock width="50%" height="52px" delay={150} />
          <SkeletonBlock width="50%" height="52px" delay={200} />
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <SkeletonBlock width="33%" height="40px" delay={180} />
          <SkeletonBlock width="33%" height="40px" delay={230} />
          <SkeletonBlock width="33%" height="40px" delay={280} />
        </div>
      </div>
    </div>
  )
}

function AnnotatedPreview({
  screenshotB64,
  annotations,
  showAnnotations,
  activeId,
  zoom = 1,
  onZoomChange,
  onSelect,
  children,
}: {
  screenshotB64: string
  annotations: Annotation[]
  showAnnotations: boolean
  activeId?: string | null
  zoom?: number
  onZoomChange?: (next: number) => void
  onSelect?: (id: string) => void
  children?: React.ReactNode
}) {
  const outerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [cardPos, setCardPos] = useState<{ left: number; top: number } | null>(null)

  const hoveredAnn = annotations.find((annotation) => annotation.id === hoveredId) ?? null

  // Trackpad pinch-to-zoom: ctrl+wheel fires continuously on macOS
  useEffect(() => {
    const el = outerRef.current
    if (!el || !onZoomChange) return
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      onZoomChange(Math.max(0.25, Math.min(3, zoom - e.deltaY * 0.008)))
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [zoom, onZoomChange])

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
        overflow: 'auto',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
      }}
    >
      <div
        ref={frameRef}
        style={{
          position: 'relative',
          width: `${zoom * 100}%`,
          flexShrink: 0,
          transition: 'width 80ms ease-out',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={toImageSrc(screenshotB64)}
          alt="Page screenshot"
          style={{
            width: '100%',
            height: 'auto',
            display: 'block',
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
  const { data: session } = useSession()
  const [screens, setScreens] = useState<{ label: string; route: string }[]>([])
  const [selectedScreen, setSelectedScreen] = useState<{ label: string; route: string } | null>(null)
  const [loadingScreens, setLoadingScreens] = useState(true)
  const [screensError, setScreensError] = useState<string | null>(null)
  // Branch picker state — lives between Project Discovery and the UX
  // transform run. Defaults to whatever the Discovery page wrote to
  // sessionStorage (usually the repo default). Changing the branch
  // invalidates cached analysis and refetches the page list.
  const [currentBranch, setCurrentBranch] = useState<string>(() => {
    if (typeof window === 'undefined') return 'main'
    return getSelectedRepo()?.branch || 'main'
  })
  const [repoBranches, setRepoBranches] = useState<{ name: string; protected: boolean }[]>([])
  const [branchesLoading, setBranchesLoading] = useState(false)
  const [analysis, setAnalysis] = useState<UXLabSession | null>(null)
  const [loadingAnalysis, setLoadingAnalysis] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [loadingStage, setLoadingStage] = useState('')
  const [loadingProgress, setLoadingProgress] = useState(0)
  const stageTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  const [showAnnotations, setShowAnnotations] = useState(true)
  const [activeFindingId, setActiveFindingId] = useState<string | null>(null)
  const [shelfExpanded, setShelfExpanded] = useState(false)
  const [pillOrder, setPillOrder] = useState<string[]>([])
  const [findings, setFindings] = useState<Finding[]>([])
  const [selectedFindingIds, setSelectedFindingIds] = useState<Set<string>>(new Set())
  const [previewZoom, setPreviewZoom] = useState(1)
  const handleZoomChange = useCallback((next: number) => {
    setPreviewZoom(Math.max(0.25, Math.min(3, next)))
  }, [])
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
    stageTimers.current.forEach(clearTimeout)
    stageTimers.current = []

    if (!loadingAnalysis) {
      if (loadingProgress > 0) {
        setLoadingProgress(100)
        const t = setTimeout(() => {
          setLoadingStage('')
          setLoadingProgress(0)
        }, 400)
        stageTimers.current.push(t)
      }
      return
    }

    const totalFinite = ANALYSIS_STAGES.reduce((sum, s) => sum + (isFinite(s.duration) ? s.duration : 0), 0)
    const startTime = Date.now()

    // Advance stage labels at their scheduled times
    let elapsed = 0
    ANALYSIS_STAGES.forEach((stage) => {
      const t = setTimeout(() => setLoadingStage(stage.message), elapsed)
      stageTimers.current.push(t)
      if (isFinite(stage.duration)) elapsed += stage.duration
    })

    // Continuously update progress based on real elapsed time
    const interval = setInterval(() => {
      const ms = Date.now() - startTime
      setLoadingProgress(Math.min(90, Math.round((ms / totalFinite) * 90)))
    }, 100)

    return () => {
      stageTimers.current.forEach(clearTimeout)
      stageTimers.current = []
      clearInterval(interval)
    }
  }, [loadingAnalysis]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load the repo's full branch list once, so the branch picker has
  // something to show. Fires once per session once we know the repo and
  // have a token.
  useEffect(() => {
    const selected = getSelectedRepo()
    if (!selected?.url) return
    const accessToken = (session as { accessToken?: string } | null)?.accessToken
    if (!accessToken) return
    const match = selected.url.match(/github\.com\/([^/]+)\/([^/]+)/)
    if (!match) return
    const owner = match[1]
    const repo = match[2].replace(/\.git$/, '')
    let cancelled = false
    setBranchesLoading(true)
    fetch(apiUrl('/github/list-branches'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner, repo, access_token: accessToken }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return
        const list = Array.isArray(data.branches) ? data.branches : []
        setRepoBranches(list)
        // If sessionStorage lied about the branch (e.g., stale value from
        // a deleted branch), fall back to the repo default.
        if (list.length && !list.some((b: { name: string }) => b.name === currentBranch)) {
          const fallback = data.default_branch || list[0].name
          setCurrentBranch(fallback)
          if (selected.url) setSelectedRepo(selected.url, fallback)
        }
      })
      .catch(() => { /* non-fatal */ })
      .finally(() => { if (!cancelled) setBranchesLoading(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

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

    const selected = getSelectedRepo()
    const repoUrl = selected?.url

    if (!repoUrl) {
      setScreensError('No repository connected.')
      setScreens([])
      setSelectedScreen(null)
      setLoadingScreens(false)
      return
    }

    const pagesEndpoint = `${apiUrl('/repo-pages')}?repo_url=${encodeURIComponent(repoUrl)}&branch=${encodeURIComponent(currentBranch)}`

    setLoadingScreens(true)
    setScreensError(null)
    const accessToken = session?.accessToken
    fetch(pagesEndpoint, accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data: { pages: { label: string; route: string }[] }) => {
        if (!data.pages.length) {
          setScreensError('No pages found on this branch.')
          setScreens([])
          setSelectedScreen(null)
        } else {
          setScreens(data.pages)
          setSelectedScreen(data.pages[0])
        }
      })
      .catch(() => {
        setScreensError('Could not load pages.')
        setScreens([])
        setSelectedScreen(null)
      })
      .finally(() => {
        setLoadingScreens(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBranch])

  useEffect(() => {
    if (!selectedScreen) return

    // Reset stale state from previous page before any async work.
    // React 18 batches these with the subsequent setAnalysis call, so
    // cached pages never flash a null state.
    setAnalysis(null)
    setAnalysisError(null)
    setLoadingAnalysis(false)
    setPreviewZoom(1)

    const cacheKey = selectedScreen.route
    if (analysisCache.current[cacheKey]) {
      setAnalysis(analysisCache.current[cacheKey])
      return
    }

    setLoadingAnalysis(true)

    const selected = getSelectedRepo()
    if (!selected?.url) {
      setAnalysisError('No repository connected.')
      setLoadingAnalysis(false)
      return
    }

    const controller = new AbortController()

    analyzeUxLab(
      selected.url,
      selected.branch,
      selectedScreen.route,
      (session as { accessToken?: string } | null)?.accessToken ?? '',
      (session as { githubId?: string } | null)?.githubId ?? 'anonymous',
      controller.signal,
    )
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
        if (error instanceof DOMException && error.name === 'AbortError') return
        console.error('Analysis failed:', error)
        setAnalysis(null)
        setAnalysisError(error instanceof Error ? error.message : 'Analysis failed for this screen.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingAnalysis(false)
      })

    return () => { controller.abort() }
  }, [selectedScreen])

  const beforeAnnotations = useMemo(
    () => buildAnnotationsFromFindings(findings, 'before', selectedScreen?.route ?? '/'),
    [findings, selectedScreen?.route],
  )

  // Reconstruct the full annotation ID for pin highlighting on the screenshot.
  // activeFindingId is always the raw finding ID; beforeAnnotations use the prefixed format.
  const activeAnnotationId = useMemo(
    () => activeFindingId
      ? (beforeAnnotations.find((a) => a.id.endsWith(':' + activeFindingId))?.id ?? null)
      : null,
    [activeFindingId, beforeAnnotations],
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

  const handleSelectFinding = useCallback((annotationOrFindingId: string) => {
    // AnnotatedPreview calls back with full annotation IDs ("before:/route:rawId").
    // Strip the prefix so activeFindingId always holds the raw finding ID,
    // which is what FindingsShelf uses for triage row highlighting.
    const parts = annotationOrFindingId.split(':')
    const rawId = parts.length >= 3 ? parts.slice(2).join(':') : annotationOrFindingId
    setActiveFindingId(rawId)
    setShelfExpanded(true)
    setPillOrder((prev) => (prev.includes(rawId) ? prev : [...prev, rawId]))
  }, [])
  const handleToggleSelection = useCallback((id: string) => {
    setSelectedFindingIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const handleApplySelected = useCallback(() => {
    const ids = new Set(selectedFindingIds)
    setFindings((prev) => {
      const updated = prev.map((f) => (ids.has(f.id) ? { ...f, status: 'queued' as const } : f))
      // Sync queued statuses back to the cache so they survive page switches.
      if (selectedScreen) {
        const cached = analysisCache.current[selectedScreen.route]
        if (cached) {
          const statusMap = new Map(updated.map((f) => [f.id, f.status]))
          analysisCache.current[selectedScreen.route] = {
            ...cached,
            findings: cached.findings.map((f) => ({ ...f, status: statusMap.get(f.id) ?? f.status })),
          }
          try {
            sessionStorage.setItem('refineui_analysis_cache', JSON.stringify(analysisCache.current))
          } catch { /* ignore */ }
        }
      }
      return updated
    })
    setSelectedFindingIds(new Set())
  }, [selectedFindingIds, selectedScreen])

  const handleSelectAll = useCallback(() => {
    setSelectedFindingIds(new Set(findings.filter((f) => f.status === 'open').map((f) => f.id)))
  }, [findings])

  const handleDeselectAll = useCallback(() => {
    setSelectedFindingIds(new Set())
  }, [])

  const handleRevertFinding = useCallback((id: string) => {
    setFindings((prev) => {
      const updated = prev.map((f) => (f.id === id ? { ...f, status: 'open' as const } : f))
      if (selectedScreen) {
        const cached = analysisCache.current[selectedScreen.route]
        if (cached) {
          const statusMap = new Map(updated.map((f) => [f.id, f.status]))
          analysisCache.current[selectedScreen.route] = {
            ...cached,
            findings: cached.findings.map((f) => ({ ...f, status: statusMap.get(f.id) ?? f.status })),
          }
          try {
            sessionStorage.setItem('refineui_analysis_cache', JSON.stringify(analysisCache.current))
          } catch { /* ignore */ }
        }
      }
      return updated
    })
  }, [selectedScreen])

  const handleBranchChange = useCallback((newBranch: string) => {
    if (!newBranch || newBranch === currentBranch) return
    const selected = getSelectedRepo()
    if (!selected?.url) return
    // Persist so downstream pages (transform run, UX Lab, page fetches)
    // pick up the new branch via getSelectedRepo().
    setSelectedRepo(selected.url, newBranch)
    // Drop every cached artifact tied to the old branch — findings, the
    // analysis cache keyed by route, and any in-flight transform result.
    analysisCache.current = {}
    try { sessionStorage.removeItem('refineui_analysis_cache') } catch { /* ignore */ }
    try { sessionStorage.removeItem('refineui_transform') } catch { /* ignore */ }
    setAnalysis(null)
    setAnalysisError(null)
    setFindings([])
    setSelectedFindingIds(new Set())
    setSelectedScreen(null)
    setScreens([])
    setCurrentBranch(newBranch)
  }, [currentBranch])

  const handleApplyTransformation = useCallback(() => {
    const selected = getSelectedRepo()
    const repoUrl = selected?.url ?? ''
    const branch = selected?.branch ?? 'main'
    const match = repoUrl.match(/github\.com\/([^/]+\/[^/]+)/)

    if (!match) {
      // No repo in storage — nothing to transform.
      setAnalysisError('No repository connected. Go back to Project Discovery to select a repo.')
      return
    }

    const fullName = match[1].replace(/\.git$/, '')
    let designIntelligence: unknown = null
    try {
      const raw = sessionStorage.getItem('refineui_analysis')
      if (raw) designIntelligence = JSON.parse(raw)
    } catch { /* ignore */ }

    const queuedFindings = Object.values(analysisCache.current)
      .flatMap((session) => session.findings)
      .filter((f) => f.status === 'queued')
      .map((f) => ({
        title: f.title,
        description: f.description,
        recommendation: f.recommendation,
        component: f.component,
        severity: f.severity,
      }))

    // Persist findings so the transform page can pick them up even if navigated
    // via the nav tab instead of this button.
    try {
      if (queuedFindings.length > 0) {
        sessionStorage.setItem('refineui_ux_lab_findings', JSON.stringify(queuedFindings))
      } else {
        sessionStorage.removeItem('refineui_ux_lab_findings')
      }
    } catch { /* ignore */ }

    // Clear any stale cached transform so the transform page doesn't skip the
    // new pipeline run (it initializes pipelineStep as 'complete' if this key exists).
    sessionStorage.removeItem('refineui_transform')

    const promise = fetch(apiUrl('/transform-repo-v2'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        github_url: `https://github.com/${fullName}`,
        branch,
        access_token: (session as { accessToken?: string } | null)?.accessToken ?? null,
        design_intelligence: designIntelligence,
        user_intent: '',
        max_pages: 5,
        github_user_id: (session?.user as { id?: string } | null | undefined)?.id ?? '',
        ux_lab_findings: queuedFindings.length > 0 ? queuedFindings : null,
      }),
    })
      .then((r) => { if (!r.ok) throw new Error(`Transform failed: ${r.status}`); return r.json() })
      .then((result) => {
        sessionStorage.setItem('refineui_transform', JSON.stringify({
          multiPageResult: result,
          repoName: fullName,
          branch,
        }))
        return result
      })
      .catch(() => null)

    ;(window as Window & { __reformPipelinePromise?: Promise<unknown> }).__reformPipelinePromise = promise
    router.push(`/dashboard/transform?repo=${encodeURIComponent(repoUrl)}&branch=${encodeURIComponent(branch)}`)
  }, [findings, session, router])

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
      className="flex h-[calc(100vh-124px)] flex-col gap-1.5 px-4 py-2 sm:h-[calc(100vh-88px)] sm:px-8"
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
                Branch
              </span>
              <select
                value={currentBranch}
                onChange={(event) => handleBranchChange(event.target.value)}
                disabled={branchesLoading || repoBranches.length === 0}
                title="Which branch Reform should analyze and transform"
                className="rounded-xl py-1.5 text-xs font-medium outline-none"
                style={{
                  background: '#1c1a25',
                  border: '1px solid rgba(74,68,85,0.3)',
                  color: branchesLoading || repoBranches.length === 0
                    ? 'rgba(230,224,240,0.35)'
                    : 'rgba(230,224,240,0.85)',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  paddingLeft: '0.75rem',
                  paddingRight: '2rem',
                  maxWidth: 220,
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='rgba(204%2C195%2C216%2C0.45)' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' fill='none'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 10px center',
                }}
              >
                {branchesLoading && repoBranches.length === 0 ? (
                  <option value={currentBranch}>Loading branches…</option>
                ) : repoBranches.length === 0 ? (
                  <option value={currentBranch}>{currentBranch}</option>
                ) : (
                  repoBranches.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name}{b.protected ? ' 🔒' : ''}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: 'rgba(204,195,216,0.4)' }}>
                Screen
              </span>
              <select
                value={selectedScreen?.label ?? ''}
                onChange={(event) => setSelectedScreen(screens.find((screen) => screen.label === event.target.value) ?? null)}
                disabled={loadingScreens || !!screensError || !screens.length}
                className="rounded-xl py-1.5 text-xs font-medium outline-none"
                style={{
                  background: '#1c1a25',
                  border: `1px solid ${screensError ? 'rgba(239,68,68,0.4)' : 'rgba(74,68,85,0.3)'}`,
                  color: loadingScreens || screensError
                    ? 'rgba(230,224,240,0.35)'
                    : 'rgba(230,224,240,0.85)',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  paddingLeft: '0.75rem',
                  paddingRight: '2rem',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='rgba(204%2C195%2C216%2C0.45)' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' fill='none'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 10px center',
                }}
              >
                {loadingScreens
                  ? <option value="">Loading pages...</option>
                  : screensError
                    ? <option value="">{screensError}</option>
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
              onClick={handleApplyTransformation}
              className="btn-primary px-4 py-2 rounded-xl text-xs font-semibold transition-all active:scale-[0.98]"
            >
              Apply Transformation →
            </button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
          <div
            className="canvas-panel"
            style={{
              flex: 1,
              borderColor: 'rgba(255,255,255,0.06)',
            }}
          >
            <div className="panel-header">
              <div className="flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }} />
                <span className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: 'rgba(204,195,216,0.5)' }}>
                  Preview
                </span>
              </div>
              <div className="flex items-center gap-2">
                {analysis && (
                  <div className="flex items-center" style={{ background: 'rgba(15,13,24,0.7)', border: '1px solid rgba(74,68,85,0.28)', borderRadius: 6, overflow: 'hidden' }}>
                    <button
                      onClick={() => handleZoomChange(previewZoom - 0.15)}
                      style={{ padding: '2px 7px', fontSize: 13, lineHeight: 1, color: 'rgba(204,195,216,0.5)', background: 'none', border: 'none', cursor: 'pointer' }}
                      title="Zoom out"
                    >−</button>
                    <button
                      onClick={() => setPreviewZoom(1)}
                      style={{ padding: '2px 4px', fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', color: previewZoom !== 1 ? 'rgba(168,85,247,0.8)' : 'rgba(204,195,216,0.4)', background: 'none', border: 'none', cursor: 'pointer', minWidth: 32, textAlign: 'center' }}
                      title="Reset zoom"
                    >{Math.round(previewZoom * 100)}%</button>
                    <button
                      onClick={() => handleZoomChange(previewZoom + 0.15)}
                      style={{ padding: '2px 7px', fontSize: 13, lineHeight: 1, color: 'rgba(204,195,216,0.5)', background: 'none', border: 'none', cursor: 'pointer' }}
                      title="Zoom in"
                    >+</button>
                  </div>
                )}
                <span className="rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em]" style={{ background: 'rgba(15,13,24,0.7)', color: 'rgba(204,195,216,0.42)', border: '1px solid rgba(74,68,85,0.28)' }}>
                  {selectedScreen?.label ?? 'Screen'}
                </span>
              </div>
            </div>

            <div id="before-panel" className="panel-screenshot">
              {loadingAnalysis || loadingProgress > 0 ? (
                <PreviewLoadingState title="Preview" stage={loadingStage} progress={loadingProgress} />
              ) : analysis ? (
                <AnnotatedPreview
                  screenshotB64={analysis.beforeScreenshotUrl}
                  annotations={beforeAnnotations}
                  showAnnotations={showAnnotations}
                  activeId={activeAnnotationId}
                  zoom={previewZoom}
                  onZoomChange={handleZoomChange}
                  onSelect={handleSelectFinding}
                />
              ) : (
                <PreviewPlaceholder title="Preview" message="Select a screen to begin analysis." />
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
          onScrollToAnnotation={handleScrollToAnnotation}
          selectedFindingIds={selectedFindingIds}
          onToggleSelection={handleToggleSelection}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
          onApplySelected={handleApplySelected}
          onRevertFinding={handleRevertFinding}
          status={shelfStatus}
          statusMessage={shelfStatusMessage}
        />
      </section>
    </div>
  )
}
