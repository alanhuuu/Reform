'use client';

// ─── Toggle: set to true to use mock data, false to hit the real backend ─────
const USE_MOCK = true;
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useSpring, useReducedMotion } from 'framer-motion';
import type { Finding, UXLabSession } from '@/types/uxlab';
import FindingsShelf from '@/components/uxlab/FindingsShelf';
import { apiUrl } from '@/lib/api';

// ─── Severity / annotation helpers ───────────────────────────────────────────

function severityColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'var(--severity-critical)';
    case 'major':    return 'var(--severity-major)';
    case 'minor':    return 'var(--severity-minor)';
    default:         return 'var(--reform-text-muted)';
  }
}

// ─── After-panel shimmer (WAAPI) ─────────────────────────────────────────────

function triggerAfterPanelShimmer() {
  const panel = document.getElementById('after-panel');
  if (!panel) return;

  const shimmer = document.createElement('div');
  shimmer.style.cssText = `
    position: absolute;
    inset: 0;
    background: linear-gradient(
      105deg,
      transparent 40%,
      rgba(123, 92, 224, 0.12) 50%,
      transparent 60%
    );
    pointer-events: none;
    z-index: 10;
    border-radius: inherit;
  `;
  panel.appendChild(shimmer);

  shimmer
    .animate(
      [
        { transform: 'translateX(-100%)', opacity: 0 },
        { transform: 'translateX(-100%)', opacity: 1, offset: 0.05 },
        { transform: 'translateX(100%)',  opacity: 1, offset: 0.95 },
        { transform: 'translateX(100%)',  opacity: 0 },
      ],
      { duration: 420, easing: 'cubic-bezier(0.77, 0, 0.175, 1)', fill: 'forwards' }
    )
    .addEventListener('finish', () => shimmer.remove());
}

// ─── Annotation bubble ────────────────────────────────────────────────────────

interface AnnotationBubbleProps {
  finding: Finding;
  index: number;
  isActive: boolean;
  onClick: (id: string) => void;
}

function AnnotationBubble({ finding, index, isActive, onClick }: AnnotationBubbleProps) {
  const shouldReduce = useReducedMotion();
  const scale = useSpring(1, { stiffness: 400, damping: 25 });

  const handleClick = () => {
    if (!shouldReduce) {
      scale.set(0.88);
      setTimeout(() => scale.set(1), 120);
    }
    onClick(finding.id);
  };

  const color = severityColor(finding.severity);

  return (
    <motion.div
      style={{
        position: 'absolute',
        left: `${finding.annotation.xPercent}%`,
        top: `${finding.annotation.yPercent}%`,
        x: '-50%',
        y: '-50%',
        scale,
        cursor: 'pointer',
        zIndex: isActive ? 10 : 5,
        width: 28,
        height: 28,
        // Pass severity color so CSS ::before ring can use it
        ['--anno-color' as string]: color,
      }}
      onClick={handleClick}
      className="anno-badge"
      data-active={isActive ? 'true' : 'false'}
      aria-label={`Finding ${index + 1}: ${finding.title}`}
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && handleClick()}
    >
      {/* Static ambient glow — opacity only, never changes size */}
      <div
        className="anno-glow"
        style={{
          position: 'absolute',
          inset: -8,
          borderRadius: '50%',
          background: color,
          filter: 'blur(6px)',
          pointerEvents: 'none',
        }}
      />
      {/* Badge surface */}
      <div
        className="anno-surface"
        style={{
          position: 'relative',
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: color,
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          fontWeight: 700,
          color: '#fff',
          letterSpacing: '-0.01em',
          overflow: 'hidden',
        }}
      >
        {/* Shine sweep — visible on hover via CSS, no JS */}
        <div className="anno-shine" />
        {index + 1}
      </div>
    </motion.div>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  animated?: boolean;
}

function Toggle({ checked, onChange, animated = true }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 32,
        height: 18,
        borderRadius: 9,
        background: checked ? 'var(--reform-purple)' : 'var(--reform-border-mid)',
        border: 'none',
        cursor: 'pointer',
        position: 'relative',
        padding: 0,
        transition: animated ? `background var(--duration-micro) var(--ease-out-hard)` : 'none',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 16 : 2,
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: '#fff',
          transition: animated ? `left var(--duration-micro) var(--ease-out-hard)` : 'none',
        }}
      />
    </button>
  );
}

// ─── API ──────────────────────────────────────────────────────────────────────

async function analyzeUrl(url: string): Promise<UXLabSession> {
  const res = await fetch(apiUrl('/api/ux-lab/analyze'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, page: 'home', competitor_urls: [], workspace_id: 'local' }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Analysis failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  // Map snake_case backend response → camelCase frontend types
  return {
    id: data.id,
    url: data.url,
    page: data.page,
    beforeScreenshotUrl: data.before_screenshot_url ?? '',
    afterScreenshotUrl: data.after_screenshot_url ?? '',
    status: data.status,
    createdAt: data.created_at,
    findings: (data.findings ?? []).map((f: Record<string, unknown>) => ({
      id: f.id,
      type: f.type,
      severity: f.severity,
      status: f.status ?? 'open',
      component: f.component,
      title: f.title,
      description: f.description,
      principle: f.principle,
      principleExplanation: f.principle_explanation,
      recommendation: f.recommendation,
      requiresCompetitorEvidence: f.requires_competitor_evidence ?? false,
      competitorEvidence: ((f.competitor_evidence as Record<string, string>[] | undefined) ?? []).map((e) => ({
        url: e.url,
        screenshotUrl: e.screenshot_url,
        annotation: e.annotation,
      })),
      annotation: {
        xPercent: (f.annotation as { xPercent: number })?.xPercent ?? 50,
        yPercent: (f.annotation as { yPercent: number })?.yPercent ?? 50,
      },
    })),
  };
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_SESSION: UXLabSession = {
  id: 'mock-1',
  url: 'https://yoursite.com',
  page: 'home',
  beforeScreenshotUrl: '',
  afterScreenshotUrl: '',
  status: 'complete',
  createdAt: new Date().toISOString(),
  findings: [
    {
      id: 'f1', type: 'ISSUE', severity: 'critical', status: 'open',
      component: 'hero.cta',
      title: 'Weak CTA copy lacks urgency',
      description: 'The primary call-to-action button reads "Submit" — a low-motivation label that gives users no indication of the value they receive by clicking.',
      principle: "Fitts's Law + Action Language",
      principleExplanation: 'CTA labels that communicate the reward outperform generic verbs ("Submit") by 14–40% in A/B tests.',
      recommendation: 'Replace "Submit" with "Start my free analysis" or "See my results".',
      requiresCompetitorEvidence: false,
      annotation: { xPercent: 48, yPercent: 38 },
    },
    {
      id: 'f2', type: 'ISSUE', severity: 'major', status: 'open',
      component: 'hero.social_proof',
      title: 'Trust signals placed below fold',
      description: 'Customer logos and testimonials appear only after scrolling. First-time visitors make trust judgments within 50ms.',
      principle: "Nielsen's Trust Heuristics",
      principleExplanation: 'Social proof above the fold creates immediate credibility before users decide whether to continue.',
      recommendation: 'Move a compact social proof strip to the hero section, directly below the headline.',
      requiresCompetitorEvidence: true,
      competitorEvidence: [{ url: 'https://stripe.com', screenshotUrl: '', annotation: 'Stripe shows "Trusted by X million businesses" directly in the hero.' }],
      annotation: { xPercent: 62, yPercent: 55 },
    },
    {
      id: 'f3', type: 'WARNING', severity: 'minor', status: 'open',
      component: 'features.grid',
      title: 'Feature hierarchy is flat',
      description: 'All six features are at equal visual weight. Without hierarchy, users face decision fatigue.',
      principle: 'Visual Hierarchy',
      principleExplanation: 'Size, weight, and contrast direct attention. A flat grid treats every feature as equally important.',
      recommendation: 'Elevate the primary differentiator to a larger hero card; present others in a 2-column grid below.',
      requiresCompetitorEvidence: false,
      annotation: { xPercent: 32, yPercent: 72 },
    },
    {
      id: 'f4', type: 'POSITIVE', severity: 'minor', status: 'open',
      component: 'nav.logo',
      title: 'Logo is well-positioned and crisp',
      description: 'The brand mark is high-contrast, top-left, and renders sharply at all sizes.',
      principle: 'Convention & Recognition',
      principleExplanation: 'Users expect the logo top-left; meeting this frees attention for your content.',
      recommendation: 'No changes needed — this is a strength to maintain.',
      requiresCompetitorEvidence: false,
      annotation: { xPercent: 12, yPercent: 8 },
    },
  ],
};

// ─── Main page ────────────────────────────────────────────────────────────────

export default function UXLabPage() {
  const [session, setSession] = useState<UXLabSession | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [activeFindingId, setActiveFindingId] = useState<string | null>(null);
  const [shelfExpanded, setShelfExpanded] = useState(false);
  const [pillOrder, setPillOrder] = useState<string[]>([]);
  const [annotationsVisible, setAnnotationsVisible] = useState(true);
  const [analyzeStatus, setAnalyzeStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [analyzeError, setAnalyzeError] = useState('');
  const [urlInput, setUrlInput] = useState('');

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (USE_MOCK) {
      setSession(MOCK_SESSION);
      setFindings(MOCK_SESSION.findings);
      return;
    }
    if (!urlInput.trim()) return;
    setAnalyzeStatus('loading');
    setAnalyzeError('');
    try {
      const result = await analyzeUrl(urlInput.trim());
      setSession(result);
      setFindings(result.findings);
      setAnalyzeStatus('idle');
    } catch (err) {
      setAnalyzeStatus('error');
      setAnalyzeError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  // Init pill order from findings sorted by severity
  useEffect(() => {
    if (findings.length) {
      const order = [...findings]
        .sort((a, b) => {
          const rank: Record<string, number> = { critical: 0, major: 1, minor: 2 };
          return (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3);
        })
        .map((f) => f.id);
      setPillOrder(order);
    }
  }, [findings]);

  const revealFindingPill = useCallback((findingId: string) => {
    setPillOrder((prev) => (prev.includes(findingId) ? prev : [...prev, findingId]));
  }, []);

  const handleAnnotationClick = useCallback((findingId: string) => {
    revealFindingPill(findingId);
    setActiveFindingId(findingId);
    setShelfExpanded(true);
  }, [revealFindingPill]);

  const handleApplyFinding = useCallback((findingId: string) => {
    setFindings((prev) =>
      prev.map((f) => (f.id === findingId ? { ...f, status: 'patched' } : f))
    );
    triggerAfterPanelShimmer();
    // TODO: call POST /api/ux-lab/sessions/:id/apply with findingId
  }, []);

  const handleScrollToAnnotation = useCallback((findingId: string) => {
    const finding = findings.find((f) => f.id === findingId);
    if (!finding) return;
    const panel = document.getElementById('before-panel');
    if (!panel) return;
    panel.scrollTo({
      top: (finding.annotation.yPercent / 100) * panel.scrollHeight,
      behavior: 'smooth',
    });
  }, [findings]);

  return (
    <div className="uxlab-page">

        {/* ── Topbar ── */}
        <header className="uxlab-topbar">
          {/* Left: logomark + wordmark */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: 'var(--reform-purple)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 700,
                color: '#fff',
              }}
            >
              R
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--reform-text-primary)' }}>
              Reform
            </span>
          </div>

          {/* Center: breadcrumb (absolute) */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              pointerEvents: 'none',
            }}
          >
            <span style={{ color: 'var(--reform-text-muted)' }}>Project Discovery</span>
            <span style={{ color: 'var(--reform-text-muted)', opacity: 0.5 }}>→</span>
            <span style={{ color: 'var(--reform-text-muted)' }}>UI Transformation</span>
            <span style={{ color: 'var(--reform-text-muted)', opacity: 0.5 }}>→</span>
            <span style={{ color: 'var(--reform-text-primary)', fontWeight: 500 }}>UX Analysis</span>
          </div>

          {/* Right: refine button */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <button className="refine-btn" onClick={() => { setSession(null); setFindings([]); setUrlInput(''); }}>
              {session ? 'Refine changes →' : 'New analysis'}
            </button>
          </div>
        </header>

        {/* ── Toolbar ── */}
        <div className="uxlab-toolbar">
          {/* Left: URL input (idle) or page selector (session loaded) */}
          {!session ? (
            <form onSubmit={handleAnalyze} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
              <span style={{ fontSize: 11, color: 'var(--reform-text-muted)', flexShrink: 0 }}>URL:</span>
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://yoursite.com"
                required
                style={{
                  flex: 1,
                  maxWidth: 360,
                  background: 'var(--reform-bg-raised)',
                  border: '1px solid var(--reform-border-mid)',
                  borderRadius: 6,
                  padding: '3px 10px',
                  fontSize: 12,
                  color: 'var(--reform-text-primary)',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                disabled={analyzeStatus === 'loading'}
                style={{
                  background: 'var(--reform-purple)',
                  border: 'none',
                  borderRadius: 6,
                  padding: '4px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#fff',
                  cursor: analyzeStatus === 'loading' ? 'default' : 'pointer',
                  opacity: analyzeStatus === 'loading' ? 0.6 : 1,
                  flexShrink: 0,
                }}
              >
                {analyzeStatus === 'loading' ? 'Analyzing…' : 'Analyze'}
              </button>
              {analyzeStatus === 'error' && (
                <span style={{ fontSize: 11, color: 'var(--severity-critical)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {analyzeError}
                </span>
              )}
            </form>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--reform-text-muted)' }}>Page:</span>
              <div className="page-selector">
                <span>{session.page}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          )}

          {/* Right: annotations toggle */}
          {session && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--reform-text-muted)' }}>Annotations</span>
              <Toggle checked={annotationsVisible} onChange={setAnnotationsVisible} />
            </div>
          )}
        </div>

        {/* ── Canvas ── */}
        <div className="uxlab-canvas">

          {/* Empty / loading state */}
          {!session && (
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 16,
              color: 'var(--reform-text-muted)',
            }}>
              {analyzeStatus === 'loading' ? (
                <>
                  <div style={{ fontSize: 32 }}>⚙️</div>
                  <div style={{ fontSize: 14, color: 'var(--reform-text-secondary)' }}>Running analysis — this takes ~30s…</div>
                  <div style={{ fontSize: 12 }}>Playwright is screenshotting, Claude is thinking</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 32 }}>🔍</div>
                  <div style={{ fontSize: 14, color: 'var(--reform-text-secondary)' }}>Enter a URL above to start your UX analysis</div>
                </>
              )}
            </div>
          )}

          {/* Before panel */}
          {session && (
          <div id="before-panel" className="canvas-panel" style={{ borderRight: '1px solid var(--reform-border-subtle)' }}>
            <div className="panel-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--reform-text-muted)', display: 'inline-block' }} />
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--reform-text-muted)' }}>
                  Before
                </span>
                <span
                  style={{
                    background: 'var(--reform-bg-raised)',
                    border: '1px solid var(--reform-border-subtle)',
                    fontSize: 9,
                    borderRadius: 4,
                    padding: '1px 5px',
                    color: 'var(--reform-text-muted)',
                  }}
                >
                  current
                </span>
              </div>
              <span style={{ fontSize: 11, color: 'var(--reform-text-muted)' }}>
                {session.url} · {session.page}
              </span>
            </div>

            <div className="panel-screenshot">
              {session.beforeScreenshotUrl ? (
                <img
                  src={session.beforeScreenshotUrl}
                  alt="Before screenshot"
                  style={{ width: '100%', display: 'block' }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    background: 'var(--reform-bg-deep)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    gap: 12,
                    color: 'var(--reform-text-muted)',
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontSize: 32 }}>🖼️</div>
                  <div>Before screenshot will appear here</div>
                </div>
              )}

              {/* Annotation bubbles */}
              {annotationsVisible &&
                findings.map((finding, i) => (
                  <AnnotationBubble
                    key={finding.id}
                    finding={finding}
                    index={i}
                    isActive={activeFindingId === finding.id}
                    onClick={handleAnnotationClick}
                  />
                ))}
            </div>
          </div>
          )}

          {/* After panel */}
          {session && (
          <div
            id="after-panel"
            className="canvas-panel"
            style={{
              borderLeft: '1px solid var(--reform-purple-glow)',
              boxShadow: 'inset 2px 0 12px rgba(123, 92, 224, 0.06)',
              position: 'relative',
            }}
          >
            <div className="panel-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--reform-purple)', display: 'inline-block' }} />
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--reform-purple)' }}>
                  After
                </span>
              </div>
            </div>

            <div className="panel-screenshot">
              {session.afterScreenshotUrl ? (
                <img
                  src={session.afterScreenshotUrl}
                  alt="After screenshot"
                  style={{ width: '100%', display: 'block' }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    background: 'var(--reform-bg-deep)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    gap: 12,
                    color: 'var(--reform-text-muted)',
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontSize: 32 }}>✨</div>
                  <div>After screenshot will appear here</div>
                </div>
              )}

              {/* Improvement labels for patched findings */}
              {findings
                .filter((f) => f.status === 'patched')
                .map((f) => (
                  <div
                    key={f.id}
                    className="improvement-label"
                    style={{
                      left: `${f.annotation.xPercent}%`,
                      top: `${f.annotation.yPercent}%`,
                      transform: 'translate(-50%, -120%)',
                    }}
                  >
                    + {f.title.toLowerCase()}
                  </div>
                ))}
            </div>
          </div>
          )}
        </div>

        {/* ── Findings shelf ── */}
        {session && <FindingsShelf
          findings={findings}
          activeFindingId={activeFindingId}
          setActiveFindingId={setActiveFindingId}
          expanded={shelfExpanded}
          setExpanded={setShelfExpanded}
          pillOrder={pillOrder}
          setPillOrder={setPillOrder}
          onApplyFinding={handleApplyFinding}
          onScrollToAnnotation={handleScrollToAnnotation}
        />}
    </div>
  );
}
