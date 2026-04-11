'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { apiUrl } from '@/lib/api'
import { getSelectedRepo } from '@/lib/selectedRepo'

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface Section {
  id: string
  tag: string
  label: string
  rect: Rect
  heading: string
  paragraph: string
  text: string
  classes?: string
  role?: string
  aria_label?: string
  element_id?: string
  source_file?: string | null
}

interface DocumentSize {
  width: number
  height: number
}

interface AvailablePage {
  name: string
  route: string
  path: string
}

interface LoadPayload {
  session_id: string
  screenshot: string
  sections: Section[]
  document_size: DocumentSize
  root_file: string | null
  root_code: string
  framework: string
  available_pages: AvailablePage[]
  current_page: string
  error?: string | null
}

interface NavigatePayload {
  session_id: string
  screenshot: string
  sections: Section[]
  document_size: DocumentSize
  current_page: string
  target_page_file: string | null
  session_expired?: boolean
  error?: string | null
}

interface ApplyPayload {
  session_id: string
  screenshot: string
  sections: Section[]
  document_size: DocumentSize
  updated_code: string
  summary: string
  target_file: string | null
  updated_section_id: string | null
  session_expired?: boolean
  error?: string | null
}

interface RepoState {
  url: string
  branch: string
}

interface SectionSnapshot {
  label: string
  heading: string
  screenshot: string
  rect: Rect
  documentSize: DocumentSize
}

interface EditSelection {
  kind: 'section' | 'rect'
  label: string
  heading: string
  paragraph: string
  text: string
  tag: string
  classes: string
  role: string
  aria_label: string
  rect: Rect
  source_file: string | null
  memberIds: string[]
}

function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  )
}

function unionRects(rects: Rect[]): Rect {
  const x1 = Math.min(...rects.map((r) => r.x))
  const y1 = Math.min(...rects.map((r) => r.y))
  const x2 = Math.max(...rects.map((r) => r.x + r.width))
  const y2 = Math.max(...rects.map((r) => r.y + r.height))
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}

function hitTestSection(x: number, y: number, sections: Section[]): Section | null {
  const hits = sections.filter(
    (s) =>
      x >= s.rect.x &&
      x <= s.rect.x + s.rect.width &&
      y >= s.rect.y &&
      y <= s.rect.y + s.rect.height,
  )
  if (!hits.length) return null
  hits.sort((a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height)
  return hits[0]
}

function sectionToSelection(s: Section): EditSelection {
  return {
    kind: 'section',
    label: s.label,
    heading: s.heading,
    paragraph: s.paragraph,
    text: s.text,
    tag: s.tag || '',
    classes: s.classes || '',
    role: s.role || '',
    aria_label: s.aria_label || '',
    rect: { ...s.rect },
    source_file: s.source_file || null,
    memberIds: [s.id],
  }
}

function buildRectSelection(
  rect: Rect,
  sections: Section[],
  rootFile: string | null,
): EditSelection {
  const included = sections.filter((s) => rectsIntersect(rect, s.rect))
  if (included.length === 0) {
    return {
      kind: 'rect',
      label: 'Custom region',
      heading: '',
      paragraph: '',
      text: '',
      tag: '',
      classes: '',
      role: '',
      aria_label: '',
      rect,
      source_file: rootFile,
      memberIds: [],
    }
  }
  if (included.length === 1) {
    const sel = sectionToSelection(included[0])
    sel.kind = 'rect'
    return sel
  }
  const label =
    included.length <= 3
      ? included.map((s) => s.label).join(' + ')
      : `${included.slice(0, 2).map((s) => s.label).join(' + ')} +${included.length - 2}`
  const heading = included
    .map((s) => s.heading)
    .filter(Boolean)
    .slice(0, 3)
    .join(' · ')
  const paragraph = included
    .map((s) => s.paragraph)
    .filter(Boolean)
    .slice(0, 2)
    .join(' · ')
  const text = included
    .map((s) => s.text)
    .filter(Boolean)
    .join(' ')
    .slice(0, 400)

  const classSet = new Set<string>()
  for (const s of included) {
    if (s.classes) {
      for (const c of s.classes.split(/\s+/)) {
        if (c) classSet.add(c)
        if (classSet.size >= 12) break
      }
    }
    if (classSet.size >= 12) break
  }
  const combinedClasses = Array.from(classSet).join(' ')
  const firstRole = included.find((s) => s.role)?.role || ''
  const firstAriaLabel = included.find((s) => s.aria_label)?.aria_label || ''
  const primaryTag = included[0]?.tag || ''

  const fileCounts: Record<string, number> = {}
  for (const s of included) {
    if (s.source_file) fileCounts[s.source_file] = (fileCounts[s.source_file] || 0) + 1
  }
  const sortedFiles = Object.entries(fileCounts).sort((a, b) => b[1] - a[1])
  const source_file = sortedFiles[0]?.[0] || rootFile

  return {
    kind: 'rect',
    label,
    heading,
    paragraph,
    text,
    tag: primaryTag,
    classes: combinedClasses,
    role: firstRole,
    aria_label: firstAriaLabel,
    rect: unionRects(included.map((s) => s.rect)),
    source_file,
    memberIds: included.map((s) => s.id),
  }
}

const PROMPT_EXAMPLES = [
  'Make this section feel more modern',
  'Reduce clutter and simplify',
  'Improve spacing and hierarchy',
]

const HIGHLIGHT_MS = 3200

export default function EditLabPage() {
  const { data: session } = useSession()
  const [repoState, setRepoState] = useState<RepoState | null>(null)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [payload, setPayload] = useState<LoadPayload | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [selection, setSelection] = useState<EditSelection | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [promptText, setPromptText] = useState('')
  const [navigating, setNavigating] = useState(false)
  const [pageMenuOpen, setPageMenuOpen] = useState(false)
  const [customPath, setCustomPath] = useState('')
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const [justUpdatedId, setJustUpdatedId] = useState<string | null>(null)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [lastEdit, setLastEdit] = useState<{
    summary: string
    before: SectionSnapshot
    afterRect: Rect
    afterDocumentSize: DocumentSize
    afterScreenshot: string
    newSectionId: string | null
  } | null>(null)

  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [canvasWidth, setCanvasWidth] = useState(1)
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const accessToken = (session as unknown as { accessToken?: string } | null)?.accessToken || ''

  useEffect(() => {
    if (typeof window === 'undefined') return
    const selected = getSelectedRepo()
    if (!selected) {
      setRepoState(null)
      return
    }
    // Prefer a branch captured by a completed transform run if present —
    // it can be more specific than the persisted default branch.
    let branch = selected.branch
    const tRaw = sessionStorage.getItem('refineui_transform')
    if (tRaw) {
      try {
        const parsed = JSON.parse(tRaw)
        if (parsed?.branch) branch = parsed.branch
      } catch {
        /* ignore */
      }
    }
    setRepoState({ url: selected.url, branch })
  }, [])

  const runLoad = useCallback(
    async (opts?: { silent?: boolean }): Promise<LoadPayload | null> => {
      if (!repoState) return null
      if (!opts?.silent) {
        setLoading(true)
        setError(null)
        setSelection(null)
        setHoveredId(null)
      }
      try {
        const res = await fetch(apiUrl('/edit-lab/load'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            github_url: repoState.url,
            branch: repoState.branch,
            access_token: accessToken,
          }),
        })
        if (!res.ok) throw new Error(`Load failed (${res.status})`)
        const data: LoadPayload = await res.json()
        if (data.error) throw new Error(data.error)
        setPayload(data)
        setSessionId(data.session_id || null)
        return data
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load preview'
        if (!opts?.silent) setError(msg)
        return null
      } finally {
        if (!opts?.silent) setLoading(false)
      }
    },
    [repoState, accessToken],
  )

  useEffect(() => {
    if (repoState && !payload && !loading && !error) runLoad()
  }, [repoState, payload, loading, error, runLoad])

  const runNavigate = useCallback(
    async (route: string) => {
      if (!sessionId) return
      const target = route.trim() || '/'
      setNavigating(true)
      setError(null)
      setSelection(null)
      setHoveredId(null)
      try {
        const res = await fetch(apiUrl('/edit-lab/navigate'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, page_path: target }),
        })
        if (!res.ok) throw new Error(`Navigate failed (${res.status})`)
        const data: NavigatePayload = await res.json()
        if (data.session_expired) {
          const reloaded = await runLoad({ silent: true })
          if (!reloaded?.session_id) throw new Error('Session expired and reload failed.')
          const retry = await fetch(apiUrl('/edit-lab/navigate'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: reloaded.session_id, page_path: target }),
          })
          if (!retry.ok) throw new Error(`Navigate failed (${retry.status})`)
          const retryData: NavigatePayload = await retry.json()
          if (retryData.error) throw new Error(retryData.error)
          setPayload((prev) =>
            prev
              ? {
                  ...prev,
                  screenshot: retryData.screenshot || prev.screenshot,
                  sections: retryData.sections || [],
                  document_size: retryData.document_size || prev.document_size,
                  current_page: retryData.current_page || target,
                }
              : prev,
          )
          setSessionId(retryData.session_id)
          return
        }
        if (data.error) throw new Error(data.error)
        setPayload((prev) =>
          prev
            ? {
                ...prev,
                screenshot: data.screenshot || prev.screenshot,
                sections: data.sections || [],
                document_size: data.document_size || prev.document_size,
                current_page: data.current_page || target,
              }
            : prev,
        )
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to navigate'
        setToast({ kind: 'err', msg })
      } finally {
        setNavigating(false)
        setPageMenuOpen(false)
      }
    },
    [sessionId, runLoad],
  )

  useEffect(() => {
    const update = () => {
      if (canvasRef.current) setCanvasWidth(canvasRef.current.clientWidth)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [payload])

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!pageMenuOpen) return
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (target && target.closest('[data-edit-lab-page-menu]')) return
      setPageMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [pageMenuOpen])

  const scale = payload && payload.document_size.width > 0
    ? canvasWidth / payload.document_size.width
    : 1

  const triggerHighlight = useCallback((sectionId: string | null) => {
    if (!sectionId) return
    setJustUpdatedId(sectionId)
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
    highlightTimerRef.current = setTimeout(() => setJustUpdatedId(null), HIGHLIGHT_MS)
  }, [])

  const performApply = useCallback(
    async (activeSessionId: string): Promise<ApplyPayload | null> => {
      if (!payload || !selection || !repoState) return null
      const targetFile = selection.source_file || payload.root_file
      if (!targetFile) {
        setToast({ kind: 'err', msg: 'Could not locate a source file for this selection.' })
        return null
      }
      const res = await fetch(apiUrl('/edit-lab/apply'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: activeSessionId,
          target_file: targetFile,
          section_label: selection.label,
          section_heading: selection.heading,
          section_paragraph: selection.paragraph,
          section_text: selection.text,
          section_tag: selection.tag,
          section_classes: selection.classes,
          section_role: selection.role,
          section_aria_label: selection.aria_label,
          prompt: promptText.trim(),
        }),
      })
      if (!res.ok) throw new Error(`Apply failed (${res.status})`)
      return (await res.json()) as ApplyPayload
    },
    [payload, selection, repoState, promptText],
  )

  const handleApply = useCallback(async () => {
    if (!payload || !selection || !repoState || !promptText.trim()) return

    const beforeSnapshot: SectionSnapshot = {
      label: selection.label,
      heading: selection.heading,
      screenshot: payload.screenshot,
      rect: { ...selection.rect },
      documentSize: { ...payload.document_size },
    }

    setApplying(true)
    setToast(null)
    setLastEdit(null)

    try {
      let active = sessionId
      if (!active) {
        const loaded = await runLoad({ silent: true })
        active = loaded?.session_id || null
        if (!active) throw new Error('Could not establish an Edit Lab session.')
      }

      let data = await performApply(active)
      if (data && data.session_expired) {
        const reloaded = await runLoad({ silent: true })
        if (!reloaded?.session_id) throw new Error('Session expired and reload failed.')
        data = await performApply(reloaded.session_id)
      }
      if (!data) throw new Error('Apply returned no data.')
      if (data.error) throw new Error(data.error)

      const newSectionId = data.updated_section_id || null
      const newSection = newSectionId
        ? data.sections.find((s) => s.id === newSectionId) || null
        : null
      const afterRect = newSection ? newSection.rect : beforeSnapshot.rect

      setPayload((prev) =>
        prev
          ? {
              ...prev,
              session_id: data!.session_id || prev.session_id,
              screenshot: data!.screenshot || prev.screenshot,
              sections: data!.sections?.length ? data!.sections : prev.sections,
              document_size: data!.document_size || prev.document_size,
            }
          : prev,
      )
      setSessionId(data.session_id || active)
      setPromptText('')
      setSelection(null)
      triggerHighlight(newSectionId)
      setLastEdit({
        summary: data.summary || `Updated ${beforeSnapshot.label}`,
        before: beforeSnapshot,
        afterRect,
        afterDocumentSize: data.document_size,
        afterScreenshot: data.screenshot,
        newSectionId,
      })
      setToast({ kind: 'ok', msg: data.summary || `Updated ${beforeSnapshot.label}` })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to apply change'
      setToast({ kind: 'err', msg })
    } finally {
      setApplying(false)
    }
  }, [
    payload,
    selection,
    repoState,
    promptText,
    sessionId,
    performApply,
    runLoad,
    triggerHighlight,
  ])

  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (applying || navigating || loading || !payload) return
      if (e.button !== 0) return
      const rect = e.currentTarget.getBoundingClientRect()
      const x = (e.clientX - rect.left) / (scale || 1)
      const y = (e.clientY - rect.top) / (scale || 1)
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      setDragStart({ x, y })
      setDragCurrent({ x, y })
      setIsDragging(false)
    },
    [applying, navigating, loading, payload, scale],
  )

  const onCanvasPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragStart) return
      const rect = e.currentTarget.getBoundingClientRect()
      const x = (e.clientX - rect.left) / (scale || 1)
      const y = (e.clientY - rect.top) / (scale || 1)
      setDragCurrent({ x, y })
      if (!isDragging) {
        const dx = (x - dragStart.x) * scale
        const dy = (y - dragStart.y) * scale
        if (Math.sqrt(dx * dx + dy * dy) > 5) setIsDragging(true)
      }
    },
    [dragStart, isDragging, scale],
  )

  const onCanvasPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragStart || !dragCurrent || !payload) {
        setDragStart(null)
        setDragCurrent(null)
        setIsDragging(false)
        return
      }
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }

      if (isDragging) {
        const x = Math.min(dragStart.x, dragCurrent.x)
        const y = Math.min(dragStart.y, dragCurrent.y)
        const width = Math.abs(dragCurrent.x - dragStart.x)
        const height = Math.abs(dragCurrent.y - dragStart.y)
        if (width * scale > 8 && height * scale > 8) {
          setSelection(buildRectSelection({ x, y, width, height }, payload.sections, payload.root_file))
        }
      } else {
        const hit = hitTestSection(dragStart.x, dragStart.y, payload.sections)
        if (hit) {
          setSelection(sectionToSelection(hit))
        } else {
          setSelection(null)
        }
      }

      setDragStart(null)
      setDragCurrent(null)
      setIsDragging(false)
    },
    [dragStart, dragCurrent, isDragging, payload, scale],
  )

  const onCanvasPointerCancel = useCallback(() => {
    setDragStart(null)
    setDragCurrent(null)
    setIsDragging(false)
  }, [])

  const dragRectPx = useMemo(() => {
    if (!dragStart || !dragCurrent || !isDragging) return null
    const x = Math.min(dragStart.x, dragCurrent.x)
    const y = Math.min(dragStart.y, dragCurrent.y)
    const width = Math.abs(dragCurrent.x - dragStart.x)
    const height = Math.abs(dragCurrent.y - dragStart.y)
    return {
      left: x * scale,
      top: y * scale,
      width: width * scale,
      height: height * scale,
    }
  }, [dragStart, dragCurrent, isDragging, scale])

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
      <style>{`
        @keyframes editLabPulse {
          0%   { box-shadow: 0 0 0 0 rgba(34,197,94,0.55); border-color: rgba(34,197,94,0.9); }
          60%  { box-shadow: 0 0 0 14px rgba(34,197,94,0.12); border-color: rgba(34,197,94,0.7); }
          100% { box-shadow: 0 0 0 6px rgba(34,197,94,0.08); border-color: rgba(34,197,94,0.55); }
        }
      `}</style>

      <div className="mb-6">
        <div className="text-[11px] mono uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Edit Lab
        </div>
        <h1 className="text-[28px] font-semibold text-white mt-1" style={{ letterSpacing: '-0.02em' }}>
          Select a section. Describe the change.
        </h1>
        <p className="text-[13px] mt-1.5 max-w-[620px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Edit Lab loads the current website from your repo. Click a section, write a short prompt, and Reform applies the change to that part of your source — the dev server stays warm, so repeat edits are fast.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5">
        <div
          className="rounded-2xl overflow-hidden relative"
          style={{
            background: 'rgba(6,8,13,0.55)',
            border: '1px solid rgba(255,255,255,0.06)',
            minHeight: 520,
          }}
        >
          <div
            className="flex items-center justify-between px-4 py-2.5 border-b gap-3"
            style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}
          >
            <div className="flex items-center gap-2 text-[11px] mono min-w-0" style={{ color: 'rgba(255,255,255,0.4)' }}>
              <div
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: payload && !loading ? '#22c55e' : 'rgba(255,255,255,0.2)' }}
              />
              <span className="truncate">
                {repoState?.url ? repoState.url.replace('https://github.com/', '') : 'no repo connected'}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>
              <div className="relative" data-edit-lab-page-menu>
                <button
                  onClick={() => setPageMenuOpen((v) => !v)}
                  disabled={!payload || loading || navigating}
                  className="flex items-center gap-1 px-1.5 py-[2px] rounded transition-colors disabled:opacity-40"
                  style={{
                    background: pageMenuOpen ? 'rgba(124,140,255,0.1)' : 'transparent',
                    color: 'rgba(255,255,255,0.55)',
                  }}
                  title="Switch page"
                >
                  <span>{payload?.current_page || '/'}</span>
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {pageMenuOpen && (
                  <div
                    className="absolute top-full left-0 mt-1.5 rounded-lg overflow-hidden min-w-[220px] max-h-[320px] z-[400000]"
                    style={{
                      background: 'rgba(6,8,13,0.96)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      backdropFilter: 'blur(14px)',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    }}
                  >
                    <div className="max-h-[240px] overflow-y-auto">
                      {(payload?.available_pages || []).length === 0 && (
                        <div className="px-3 py-2 text-[10px] mono" style={{ color: 'rgba(255,255,255,0.3)' }}>
                          No pages discovered
                        </div>
                      )}
                      {(payload?.available_pages || []).map((p) => {
                        const isCurrent = p.route === payload?.current_page
                        return (
                          <button
                            key={p.route}
                            onClick={() => runNavigate(p.route)}
                            className="w-full text-left px-3 py-2 flex items-center justify-between gap-3 transition-colors"
                            style={{
                              background: isCurrent ? 'rgba(124,140,255,0.1)' : 'transparent',
                              color: isCurrent ? 'white' : 'rgba(255,255,255,0.7)',
                            }}
                            onMouseEnter={(e) => {
                              if (!isCurrent) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                            }}
                            onMouseLeave={(e) => {
                              if (!isCurrent) e.currentTarget.style.background = 'transparent'
                            }}
                          >
                            <span className="text-[12px] font-medium truncate">{p.name}</span>
                            <span className="text-[10px] mono flex-shrink-0" style={{ color: 'rgba(255,255,255,0.35)' }}>
                              {p.route}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                    <div className="border-t px-3 py-2 flex items-center gap-2" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                      <input
                        type="text"
                        value={customPath}
                        onChange={(e) => setCustomPath(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && customPath.trim()) {
                            runNavigate(customPath.trim())
                            setCustomPath('')
                          }
                        }}
                        placeholder="/custom/path"
                        className="flex-1 bg-transparent outline-none text-[11px] mono"
                        style={{ color: 'white' }}
                      />
                      <button
                        onClick={() => {
                          if (customPath.trim()) {
                            runNavigate(customPath.trim())
                            setCustomPath('')
                          }
                        }}
                        disabled={!customPath.trim()}
                        className="text-[10px] px-2 py-[3px] rounded disabled:opacity-30"
                        style={{
                          background: 'rgba(124,140,255,0.12)',
                          border: '1px solid rgba(124,140,255,0.2)',
                          color: 'white',
                        }}
                      >
                        Go
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {payload?.framework && payload.framework !== 'unknown' && (
                <span className="px-1.5 py-[2px] rounded flex-shrink-0" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  {payload.framework}
                </span>
              )}
              {sessionId && !loading && (
                <span
                  className="px-1.5 py-[2px] rounded flex-shrink-0 flex items-center gap-1"
                  style={{ background: 'rgba(34,197,94,0.08)', color: 'rgba(134,239,172,0.9)' }}
                  title="Dev server is warm — edits reuse it"
                >
                  <span className="w-1 h-1 rounded-full" style={{ background: '#22c55e' }} />
                  warm
                </span>
              )}
            </div>
            <button
              onClick={() => runLoad()}
              disabled={loading || !repoState}
              className="text-[11px] px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40 flex-shrink-0"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.55)',
              }}
            >
              {loading ? 'Loading…' : 'Reload preview'}
            </button>
          </div>

          <div ref={canvasRef} className="relative w-full" style={{ minHeight: 500 }}>
            {!repoState && !loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="text-[13px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  No repository connected yet.
                </div>
                <Link
                  href="/dashboard/discovery"
                  className="text-[11px] px-3 py-1.5 rounded-lg"
                  style={{
                    background: 'rgba(124,140,255,0.12)',
                    border: '1px solid rgba(124,140,255,0.2)',
                    color: 'rgba(255,255,255,0.8)',
                  }}
                >
                  Go to Project Discovery
                </Link>
              </div>
            )}

            {loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                <div
                  className="w-6 h-6 rounded-full animate-spin"
                  style={{ border: '2px solid rgba(124,140,255,0.15)', borderTopColor: '#7c8cff' }}
                />
                <div className="text-[12px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Cloning repo and booting the dev server…
                </div>
                <div className="text-[10px] mono max-w-[320px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  First load takes 60–120s. After this, edits reuse the warm dev server and take ~10s each.
                </div>
              </div>
            )}

            {error && !loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6">
                <div className="text-[13px] text-center max-w-[380px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  {error}
                </div>
                <button
                  onClick={() => runLoad()}
                  className="text-[11px] px-3 py-1.5 rounded-lg"
                  style={{
                    background: 'rgba(124,140,255,0.12)',
                    border: '1px solid rgba(124,140,255,0.2)',
                    color: 'rgba(255,255,255,0.8)',
                  }}
                >
                  Try again
                </button>
              </div>
            )}

            {payload && payload.screenshot && !loading && (
              <div
                className="relative w-full select-none"
                style={{
                  height: payload.document_size.height * scale,
                  cursor: applying || navigating ? 'default' : 'crosshair',
                  touchAction: 'none',
                }}
                onPointerDown={onCanvasPointerDown}
                onPointerMove={onCanvasPointerMove}
                onPointerUp={onCanvasPointerUp}
                onPointerCancel={onCanvasPointerCancel}
              >
                <img
                  src={`data:image/png;base64,${payload.screenshot}`}
                  alt="Current website preview"
                  className="w-full block"
                  style={{ display: 'block', pointerEvents: 'none', userSelect: 'none' }}
                  draggable={false}
                />
                {payload.sections.map((sec) => {
                  const isMember = selection?.memberIds.includes(sec.id) ?? false
                  const isHovered = hoveredId === sec.id && !isDragging
                  const isJustUpdated = justUpdatedId === sec.id
                  const area = Math.max(1, sec.rect.width * sec.rect.height)
                  const z = 100000 - Math.round(area / 1000)
                  return (
                    <div
                      key={sec.id}
                      onPointerEnter={() => !isDragging && setHoveredId(sec.id)}
                      onPointerLeave={() =>
                        setHoveredId((prev) => (prev === sec.id ? null : prev))
                      }
                      className="absolute transition-[border,background] duration-100 pointer-events-none"
                      style={{
                        left: sec.rect.x * scale,
                        top: sec.rect.y * scale,
                        width: sec.rect.width * scale,
                        height: sec.rect.height * scale,
                        zIndex: isJustUpdated ? 250000 : z,
                        border: isJustUpdated
                          ? '2px solid rgba(34,197,94,0.9)'
                          : isMember
                            ? '1.5px solid rgba(124,140,255,0.7)'
                            : isHovered
                              ? '1px solid rgba(124,140,255,0.4)'
                              : '1px solid transparent',
                        background: isJustUpdated
                          ? 'rgba(34,197,94,0.08)'
                          : isMember
                            ? 'rgba(124,140,255,0.05)'
                            : isHovered
                              ? 'rgba(124,140,255,0.025)'
                              : 'transparent',
                        animation: isJustUpdated ? 'editLabPulse 2.8s ease-out' : undefined,
                      }}
                    >
                      {(isHovered || isJustUpdated) && !isMember && (
                        <div
                          className="absolute left-0 px-2 py-[3px] rounded-md text-[10px] mono whitespace-nowrap pointer-events-none flex items-center gap-1"
                          style={{
                            top: sec.rect.y * scale > 22 ? -22 : 4,
                            background: isJustUpdated ? '#22c55e' : 'rgba(6,8,13,0.92)',
                            color: isJustUpdated ? 'white' : 'rgba(255,255,255,0.78)',
                            border: isJustUpdated ? 'none' : '1px solid rgba(255,255,255,0.08)',
                            backdropFilter: 'blur(8px)',
                          }}
                        >
                          {isJustUpdated && <span>✓</span>}
                          {sec.label}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Active selection outline (click or rect) */}
                {selection && !isDragging && (
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      left: selection.rect.x * scale,
                      top: selection.rect.y * scale,
                      width: selection.rect.width * scale,
                      height: selection.rect.height * scale,
                      border: '2px solid #7c8cff',
                      background: 'rgba(124,140,255,0.06)',
                      boxShadow: '0 0 0 4px rgba(124,140,255,0.12)',
                      zIndex: 260000,
                    }}
                  >
                    <div
                      className="absolute left-0 px-2 py-[3px] rounded-md text-[10px] mono whitespace-nowrap flex items-center gap-1"
                      style={{
                        top: selection.rect.y * scale > 22 ? -22 : 4,
                        background: '#7c8cff',
                        color: 'white',
                      }}
                    >
                      {selection.label}
                      {selection.memberIds.length > 1 && (
                        <span style={{ opacity: 0.75 }}>· {selection.memberIds.length} sections</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Live drag rectangle */}
                {dragRectPx && (
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      left: dragRectPx.left,
                      top: dragRectPx.top,
                      width: dragRectPx.width,
                      height: dragRectPx.height,
                      border: '1.5px dashed rgba(124,140,255,0.75)',
                      background: 'rgba(124,140,255,0.06)',
                      zIndex: 270000,
                    }}
                  />
                )}

                {payload.sections.length === 0 && (
                  <div
                    className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full text-[10px] mono"
                    style={{
                      background: 'rgba(6,8,13,0.82)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: 'rgba(255,255,255,0.45)',
                    }}
                  >
                    No sections detected on this page
                  </div>
                )}

                {navigating && !applying && (
                  <div
                    className="absolute inset-0 flex items-center justify-center"
                    style={{
                      background: 'rgba(5,7,12,0.68)',
                      backdropFilter: 'blur(4px)',
                      zIndex: 300000,
                    }}
                  >
                    <div className="flex flex-col items-center gap-3 text-center">
                      <div
                        className="w-6 h-6 rounded-full animate-spin"
                        style={{ border: '2px solid rgba(124,140,255,0.15)', borderTopColor: '#7c8cff' }}
                      />
                      <div className="text-[12px]" style={{ color: 'rgba(255,255,255,0.65)' }}>
                        Loading {payload?.current_page || 'page'}…
                      </div>
                      <div className="text-[10px] mono" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        Reusing warm dev server
                      </div>
                    </div>
                  </div>
                )}

                {applying && (
                  <div
                    className="absolute inset-0 flex items-center justify-center"
                    style={{
                      background: 'rgba(5,7,12,0.72)',
                      backdropFilter: 'blur(4px)',
                      zIndex: 300000,
                    }}
                  >
                    <div className="flex flex-col items-center gap-3 text-center">
                      <div
                        className="w-6 h-6 rounded-full animate-spin"
                        style={{ border: '2px solid rgba(124,140,255,0.15)', borderTopColor: '#7c8cff' }}
                      />
                      <div className="text-[12px]" style={{ color: 'rgba(255,255,255,0.65)' }}>
                        Applying change to {selection?.label || 'selection'}…
                      </div>
                      <div className="text-[10px] mono" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        Hot-reloading the warm dev server — ~10s
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div
          className="rounded-2xl p-5 flex flex-col gap-4 h-fit lg:sticky lg:top-[100px]"
          style={{
            background: 'rgba(6,8,13,0.55)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          {!selection && !lastEdit && (
            <div className="py-8 flex flex-col items-center gap-3 text-center">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{
                  background: 'rgba(124,140,255,0.08)',
                  border: '1px solid rgba(124,140,255,0.15)',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c8cff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                </svg>
              </div>
              <div className="text-[13px] font-medium text-white">Click or drag to select</div>
              <div className="text-[11px] max-w-[260px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Click any section, or drag a rectangle across multiple. The dev server stays warm between edits.
              </div>
            </div>
          )}

          {!selection && lastEdit && (
            <LastEditCard
              lastEdit={lastEdit}
              onDismiss={() => setLastEdit(null)}
            />
          )}

          {selection && (
            <>
              <div>
                <div className="flex items-center justify-between">
                  <div className="text-[10px] mono uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    <span>Editing</span>
                    {selection.kind === 'rect' && selection.memberIds.length > 1 && (
                      <span
                        className="px-1.5 py-[1px] rounded"
                        style={{ background: 'rgba(124,140,255,0.15)', color: 'rgba(170,180,255,0.9)' }}
                      >
                        {selection.memberIds.length} sections
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setSelection(null)
                      setPromptText('')
                    }}
                    disabled={applying}
                    className="text-[10px] disabled:opacity-40"
                    style={{ color: 'rgba(255,255,255,0.3)' }}
                  >
                    clear
                  </button>
                </div>
                <div className="text-[15px] font-semibold text-white mt-1">{selection.label}</div>
                {selection.heading && (
                  <div className="text-[11px] mt-1 line-clamp-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    “{selection.heading}”
                  </div>
                )}
                {selection.kind === 'rect' && selection.memberIds.length === 0 && (
                  <div className="text-[11px] mt-1" style={{ color: 'rgba(234,179,8,0.7)' }}>
                    No detected content inside this rectangle — the edit will target the page root file.
                  </div>
                )}
                {selection.source_file && (
                  <div
                    className="text-[10px] mono mt-2 truncate px-2 py-1 rounded"
                    style={{
                      color: 'rgba(255,255,255,0.45)',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.05)',
                    }}
                    title={selection.source_file}
                  >
                    {selection.source_file}
                  </div>
                )}
              </div>

              <div>
                <div
                  className="text-[10px] mono uppercase tracking-wider mb-1.5"
                  style={{ color: 'rgba(255,255,255,0.3)' }}
                >
                  Describe the change
                </div>
                <textarea
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  placeholder="Make this section feel more modern…"
                  rows={4}
                  disabled={applying}
                  className="w-full rounded-lg px-3 py-2.5 text-[13px] resize-none outline-none disabled:opacity-50"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'white',
                  }}
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {PROMPT_EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      onClick={() => setPromptText(ex)}
                      disabled={applying}
                      className="text-[10px] px-2 py-1 rounded-md transition-colors disabled:opacity-40"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        color: 'rgba(255,255,255,0.5)',
                      }}
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleApply}
                disabled={applying || !promptText.trim()}
                className="w-full py-2.5 rounded-xl text-[12px] font-medium transition-all disabled:cursor-not-allowed"
                style={{
                  background:
                    applying || !promptText.trim()
                      ? 'rgba(124,140,255,0.08)'
                      : 'rgba(124,140,255,0.18)',
                  border: '1px solid rgba(170,180,255,0.22)',
                  color: applying || !promptText.trim() ? 'rgba(255,255,255,0.35)' : 'white',
                }}
              >
                {applying ? 'Applying…' : 'Apply change'}
              </button>

              {lastEdit && <LastEditCard lastEdit={lastEdit} onDismiss={() => setLastEdit(null)} compact />}
            </>
          )}

          {toast && (
            <div
              className="rounded-lg px-3 py-2 text-[11px]"
              style={{
                background: toast.kind === 'ok' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                border: `1px solid ${toast.kind === 'ok' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.22)'}`,
                color: toast.kind === 'ok' ? 'rgba(187,247,208,0.9)' : 'rgba(254,202,202,0.9)',
              }}
            >
              {toast.msg}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function LastEditCard({
  lastEdit,
  onDismiss,
  compact = false,
}: {
  lastEdit: {
    summary: string
    before: SectionSnapshot
    afterRect: Rect
    afterDocumentSize: DocumentSize
    afterScreenshot: string
    newSectionId: string | null
  }
  onDismiss: () => void
  compact?: boolean
}) {
  return (
    <div
      className="rounded-xl p-3 flex flex-col gap-3"
      style={{
        background: 'rgba(34,197,94,0.04)',
        border: '1px solid rgba(34,197,94,0.18)',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#22c55e' }} />
          <div className="text-[10px] mono uppercase tracking-wider" style={{ color: 'rgba(134,239,172,0.9)' }}>
            Updated {lastEdit.before.label}
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="text-[10px]"
          style={{ color: 'rgba(255,255,255,0.3)' }}
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
      <div className="text-[12px] font-medium text-white line-clamp-2">{lastEdit.summary}</div>

      {!compact && (
        <div className="grid grid-cols-2 gap-2">
          <SectionCrop
            label="Before"
            screenshot={lastEdit.before.screenshot}
            rect={lastEdit.before.rect}
            documentSize={lastEdit.before.documentSize}
          />
          <SectionCrop
            label="After"
            screenshot={lastEdit.afterScreenshot}
            rect={lastEdit.afterRect}
            documentSize={lastEdit.afterDocumentSize}
          />
        </div>
      )}
    </div>
  )
}

function SectionCrop({
  label,
  screenshot,
  rect,
  documentSize,
}: {
  label: string
  screenshot: string
  rect: Rect
  documentSize: DocumentSize
}) {
  const displayWidth = 160
  const widthScale = displayWidth / Math.max(rect.width, 1)
  const displayHeight = Math.min(180, Math.max(60, rect.height * widthScale))
  // If the section is very tall, cap height and let it crop from the top.
  const scale = Math.min(widthScale, displayHeight / Math.max(rect.height, 1))
  const effectiveScale = Math.min(widthScale, scale)

  return (
    <div className="flex flex-col gap-1">
      <div className="text-[9px] mono uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>
        {label}
      </div>
      <div
        className="rounded-md overflow-hidden"
        style={{
          width: displayWidth,
          height: displayHeight,
          border: '1px solid rgba(255,255,255,0.08)',
          background: '#0a0d14',
          backgroundImage: `url(data:image/png;base64,${screenshot})`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: `${documentSize.width * effectiveScale}px ${documentSize.height * effectiveScale}px`,
          backgroundPosition: `${-rect.x * effectiveScale}px ${-rect.y * effectiveScale}px`,
        }}
      />
    </div>
  )
}
