'use client';

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Finding } from '@/types/uxlab';

// ─── Helpers ──────────────────────────────────────────────────────────────────


function typeLabel(type: string): string {
  switch (type) {
    case 'ISSUE':    return 'Issue';
    case 'WARNING':  return 'Warning';
    case 'POSITIVE': return 'Positive';
    default:         return type;
  }
}

function typeColor(type: string): string {
  switch (type) {
    case 'ISSUE':    return '#ff5555';
    case 'WARNING':  return '#fbbf24';
    case 'POSITIVE': return '#4ade80';
    default:         return 'var(--reform-text-muted)';
  }
}

const SHELF_COLLAPSED = 64;
const SHELF_EXPANDED  = 300;
const SNAP_THRESHOLD  = 120; // px — below this snaps to collapsed

function clampShelfHeight(height: number, maxHeight: number): number {
  return Math.max(SHELF_COLLAPSED, Math.min(maxHeight, height));
}

function getComfortExpandedShelfHeight(maxHeight: number): number {
  return clampShelfHeight(Math.max(SHELF_EXPANDED, maxHeight), maxHeight);
}

function getTriageAnimationDelay(index: number): string {
  return `${35 + index * 28}ms`;
}

// ─── SortablePill ─────────────────────────────────────────────────────────────

interface PillProps {
  finding: Finding;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDismiss: (id: string) => void;
}

function SortablePill({ finding, isActive, onSelect, onDismiss }: PillProps) {
  const shouldReduce = useReducedMotion();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: finding.id });

  const handleDismiss = (e: React.PointerEvent<HTMLButtonElement> | React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onDismiss(finding.id);
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: shouldReduce ? 'none' : transition,
        opacity: isDragging ? 0.35 : 1,
        zIndex: isDragging ? 50 : 'auto',
        position: 'relative',
      }}
      {...attributes}
      {...listeners}
      className="finding-pill"
      data-active={isActive ? 'true' : 'false'}
      title={finding.title}
      onClick={() => onSelect(finding.id)}
    >
      <span
        className="finding-pill-dot"
        style={{ background: typeColor(finding.type) }}
      />
      <span className="finding-pill-label">{finding.title}</span>
      {/* X dismiss button */}
      <button
        className="pill-dismiss"
        aria-label="Dismiss"
        onPointerDown={handleDismiss}
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onClick={handleDismiss}
      >
        ×
      </button>
    </div>
  );
}

// ─── TriageRow ────────────────────────────────────────────────────────────────

interface TriageRowProps {
  finding: Finding;
  index: number;
  isActive: boolean;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onRevert: (id: string) => void;
  onScrollToAnnotation: (id: string) => void;
  isAnimating: boolean;
}

function TriageRow({
  finding,
  index,
  isActive,
  isSelected,
  onSelect,
  onToggleSelect,
  onRevert,
  onScrollToAnnotation,
  isAnimating,
}: TriageRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleSelect(finding.id);
  };

  const handleRevert = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRevert(finding.id);
  };


  return (
    <div
      ref={rowRef}
      className="triage-row"
      data-active={isActive ? 'true' : 'false'}
      data-status={finding.status}
      data-animating={isAnimating ? 'true' : 'false'}
      style={isAnimating ? { animationDelay: getTriageAnimationDelay(index) } : undefined}
      onClick={() => onSelect(finding.id)}
    >
      <div
        style={{
          width: 18, height: 18, borderRadius: '50%',
          background: typeColor(finding.type),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, fontSize: 8, fontWeight: 700, color: '#fff',
        }}
      >
        {index + 1}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11, fontWeight: 600, color: 'var(--reform-text-primary)',
          lineHeight: 1.4, display: '-webkit-box',
          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {finding.title}
        </div>
        {finding.principle && (
          <div style={{ marginTop: 2 }}>
            <span style={{ fontSize: 10, color: 'var(--reform-text-muted)' }}>
              {finding.principle}
            </span>
          </div>
        )}
      </div>

      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        {finding.status === 'queued' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ background: 'rgba(168,85,247,0.15)', color: '#c084fc', fontSize: 9, fontWeight: 700, borderRadius: 4, padding: '2px 6px', border: '1px solid rgba(168,85,247,0.25)' }}>
              Modification Staged
            </span>
            <button
              onClick={handleRevert}
              aria-label="Undo queue"
              style={{
                background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                color: 'rgba(204,195,216,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 14, height: 14, lineHeight: 1, fontSize: 14,
                transition: 'color 120ms',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(204,195,216,0.8)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(204,195,216,0.35)')}
            >
              ×
            </button>
          </div>
        )}
        {finding.status === 'patched' && (
          <span style={{ background: '#052E16', color: '#4ADE80', fontSize: 9, fontWeight: 700, borderRadius: 4, padding: '2px 6px' }}>
            patched
          </span>
        )}
        {finding.status === 'dismissed' && (
          <span style={{ background: 'var(--reform-bg-raised)', color: 'var(--reform-text-muted)', fontSize: 9, borderRadius: 4, padding: '2px 6px' }}>
            dismissed
          </span>
        )}
        {finding.status === 'open' && (
          <button
            onClick={handleToggle}
            aria-label={isSelected ? 'Deselect finding' : 'Select finding'}
            style={{
              width: 16, height: 16, borderRadius: 4, flexShrink: 0, cursor: 'pointer',
              border: isSelected ? 'none' : '1.5px solid rgba(255,255,255,0.18)',
              background: isSelected ? '#a855f7' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0, transition: 'background 120ms, border 120ms',
            }}
          >
            {isSelected && (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 5l2.5 2.5L8 3" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── FindingsShelf ────────────────────────────────────────────────────────────

interface FindingsShelfProps {
  findings: Finding[];
  activeFindingId: string | null;
  setActiveFindingId: (id: string | null) => void;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
  pillOrder: string[];
  setPillOrder: React.Dispatch<React.SetStateAction<string[]>>;
  onScrollToAnnotation: (id: string) => void;
  selectedFindingIds: Set<string>;
  onToggleSelection: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onApplySelected: () => void;
  onRevertFinding: (id: string) => void;
  status?: 'idle' | 'loading' | 'error' | 'ready';
  statusMessage?: string;
}

export default function FindingsShelf({
  findings,
  activeFindingId,
  setActiveFindingId,
  expanded,
  setExpanded,
  pillOrder,
  setPillOrder,
  onScrollToAnnotation,
  selectedFindingIds,
  onToggleSelection,
  onSelectAll,
  onDeselectAll,
  onApplySelected,
  onRevertFinding,
  status = 'ready',
  statusMessage,
}: FindingsShelfProps) {
  const [activeDragId, setActiveDragId]   = useState<string | null>(null);
  const [isAnimating, setIsAnimating]     = useState(false);
  const [shelfHeight, setShelfHeight]     = useState(SHELF_COLLAPSED);
  const [maxShelfHeight, setMaxShelfHeight] = useState(SHELF_EXPANDED);
  const [isResizing, setIsResizing]       = useState(false);
  const pillRowRef  = useRef<HTMLDivElement>(null);
  const shelfRef    = useRef<HTMLDivElement>(null);
  const wasExpanded = useRef(false);
  const didResizeDrag = useRef(false);
  const dragStartY  = useRef(0);
  const dragStartH  = useRef(0);
  const resizeCurrentH = useRef(SHELF_COLLAPSED);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  // Derive max shelf height from the actual parent container so the shelf
  // can expand as far as the layout allows without guessing CSS variable values.
  useEffect(() => {
    const updateMaxShelfHeight = () => {
      const parent = shelfRef.current?.parentElement;
      const nextMax = parent
        ? Math.max(SHELF_COLLAPSED, Math.floor(parent.clientHeight * 0.45))
        : Math.max(SHELF_COLLAPSED, Math.floor(window.innerHeight * 0.5));
      setMaxShelfHeight(nextMax);
      setShelfHeight((height) => clampShelfHeight(height, nextMax));
    };

    updateMaxShelfHeight();
    const ro = new ResizeObserver(updateMaxShelfHeight);
    if (shelfRef.current?.parentElement) ro.observe(shelfRef.current.parentElement);
    window.addEventListener('resize', updateMaxShelfHeight);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateMaxShelfHeight);
    };
  }, []);

  // Sync shelfHeight ↔ expanded prop
  useEffect(() => {
    setShelfHeight((height) => {
      if (!expanded) return height > SHELF_COLLAPSED ? SHELF_COLLAPSED : height;
      if (height <= SHELF_COLLAPSED) return getComfortExpandedShelfHeight(maxShelfHeight);
      return clampShelfHeight(height, maxShelfHeight);
    });
  }, [expanded, maxShelfHeight]);

  // Stagger animation gate
  useEffect(() => {
    if (expanded && !wasExpanded.current) {
      setIsAnimating(true);
      const t = setTimeout(() => setIsAnimating(false), 500);
      wasExpanded.current = true;
      return () => clearTimeout(t);
    }
    if (!expanded) wasExpanded.current = false;
  }, [expanded]);

  // Escape to collapse
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && expanded) setExpanded(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [expanded, setExpanded]);

  // ── Drag-to-resize handle ──────────────────────────────────────────
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragStartY.current = e.clientY;
    dragStartH.current = shelfHeight;
    resizeCurrentH.current = shelfHeight;
    didResizeDrag.current = false;
    setIsResizing(true);

    const onMove = (me: MouseEvent) => {
      const delta = dragStartY.current - me.clientY; // drag up = taller
      const next = clampShelfHeight(dragStartH.current + delta, maxShelfHeight);
      if (Math.abs(delta) > 3) didResizeDrag.current = true;
      resizeCurrentH.current = next;
      setShelfHeight(next);
      setExpanded(next > SHELF_COLLAPSED);
    };

    const onUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      // Only snap near collapsed; otherwise leave the shelf exactly where the user dropped it.
      const next = clampShelfHeight(resizeCurrentH.current, maxShelfHeight);
      if (next < SNAP_THRESHOLD) {
        setExpanded(false);
        setShelfHeight(SHELF_COLLAPSED);
      } else {
        setExpanded(true);
        setShelfHeight(next);
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [maxShelfHeight, shelfHeight, setExpanded]);

  const handleLipClick = useCallback(() => {
    if (didResizeDrag.current) {
      didResizeDrag.current = false;
      return;
    }
    if (isResizing) return;
    const next = !expanded;
    setExpanded(next);
    setShelfHeight(next ? getComfortExpandedShelfHeight(maxShelfHeight) : SHELF_COLLAPSED);
  }, [expanded, isResizing, maxShelfHeight, setExpanded]);

  // ── Pill DnD ──────────────────────────────────────────────────────
  const handlePillDragStart = (e: DragStartEvent) => setActiveDragId(e.active.id as string);
  const handlePillDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveDragId(null);
    if (!over || active.id === over.id) return;
    setPillOrder(arrayMove(pillOrder, pillOrder.indexOf(active.id as string), pillOrder.indexOf(over.id as string)));
  };

  const handleDismissPill = useCallback((id: string) => {
    setPillOrder((order) => order.filter(pid => pid !== id));
  }, [setPillOrder]);

  const handleSelectFinding = useCallback((id: string) => {
    setPillOrder((order) => (order.includes(id) ? order : [...order, id]));
    setActiveFindingId(id);
  }, [setActiveFindingId, setPillOrder]);

  const activeFinding = findings.find(f => f.id === activeFindingId) ?? findings[0] ?? null;
  const queuedCount   = findings.filter(f => f.status === 'queued').length;
  const patchedCount  = findings.filter(f => f.status === 'patched').length;
  const isEmpty = findings.length === 0;

  const emptyStateTitle =
    status === 'loading'
      ? 'Preparing findings'
      : status === 'error'
        ? 'Analysis needs another pass'
        : 'Waiting for analysis';

  const emptyStateBody =
    statusMessage ?? (
      status === 'loading'
        ? 'We are scanning this screen now. Findings, principles, and recommendations will appear here as soon as the analysis completes.'
        : status === 'error'
          ? 'This screen did not return findings. Try rerunning the analysis or switching to another route.'
          : 'Run a UX analysis to populate this shelf with prioritized findings, rationale, and recommended changes.'
    );

  const headerSummary =
    status === 'loading'
      ? 'Preparing findings'
      : status === 'error'
        ? 'Analysis failed'
        : isEmpty
          ? 'No findings yet'
          : `${findings.length} findings · ${queuedCount} staged · ${patchedCount} patched`;

  const placeholderPills = [
    'Primary friction point',
    'Hierarchy issue',
    'Recommendation preview',
  ];

  const placeholderRows = [
    'Finding will appear here',
    'Severity, component, and recommendation load after analysis',
    status === 'error' ? 'Try rerunning this screen to repopulate the shelf' : 'Switch screens or rerun to refresh the review',
  ];

  return (
    <div
        ref={shelfRef}
        className="shelf"
        data-expanded={expanded ? 'true' : 'false'}
        style={{
          height: shelfHeight,
          transition: isResizing ? 'none' : `height var(--duration-shelf) var(--ease-drawer)`,
        }}
      >
        {/* ── Centered drag lip ── */}
        <div
          className="shelf-lip"
          onMouseDown={handleResizeStart}
          onClick={handleLipClick}
        >
          <div className="shelf-lip-pill" />
        </div>

        {/* ── Header (count + pill row) ── */}
        <div className="shelf-header">
          <span style={{ fontSize: 11, color: 'var(--reform-text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {headerSummary}
          </span>

          {isEmpty ? (
            <div
              className="pill-row-container"
              ref={pillRowRef}
              onClick={e => e.stopPropagation()}
            >
              {placeholderPills.map((label) => (
                <div key={label} className="finding-pill finding-pill-placeholder ai-shimmer">
                  <span className="finding-pill-dot" style={{ background: 'rgba(255,255,255,0.16)' }} />
                  <span className="finding-pill-label" style={{ color: 'rgba(204,195,216,0.32)' }}>{label}</span>
                </div>
              ))}
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handlePillDragStart}
              onDragEnd={handlePillDragEnd}
              autoScroll={{ enabled: true, threshold: { x: 0.15, y: 0 }, acceleration: 12 }}
            >
              <SortableContext items={pillOrder} strategy={horizontalListSortingStrategy}>
                <div
                  className="pill-row-container"
                  ref={pillRowRef}
                  onClick={e => e.stopPropagation()}
                >
                  {pillOrder.map(id => {
                    const finding = findings.find(f => f.id === id);
                    if (!finding) return null;
                    return (
                      <SortablePill
                        key={id}
                        finding={finding}
                        isActive={activeFindingId === id}
                        onSelect={fid => {
                          handleSelectFinding(fid);
                          setExpanded(true);
                          setShelfHeight((height) => clampShelfHeight(Math.max(height, getComfortExpandedShelfHeight(maxShelfHeight)), maxShelfHeight));
                        }}
                        onDismiss={handleDismissPill}
                      />
                    );
                  })}
                </div>
              </SortableContext>

              <DragOverlay>
                {activeDragId ? (() => {
                  const f = findings.find(f => f.id === activeDragId);
                  if (!f) return null;
                  return (
                    <div
                      className="finding-pill"
                      data-active={activeDragId === activeFindingId ? 'true' : 'false'}
                      style={{ transform: 'scale(1.06)', boxShadow: '0 8px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(123,92,224,0.3)', cursor: 'grabbing', opacity: 1 }}
                    >
                      <span className="finding-pill-dot" style={{ background: typeColor(f.type) }} />
                      <span className="finding-pill-label">{f.title}</span>
                    </div>
                  );
                })() : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>

        {/* ── Expanded content ── */}
        <div className="shelf-content">
          {/* Left detail panel */}
          <div style={{
            width: 'var(--shelf-left-width)', padding: '12px 16px',
            borderRight: '1px solid var(--reform-border-subtle)',
            overflowY: 'auto', flexShrink: 0,
          }}>
            {activeFinding ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                    color: typeColor(activeFinding.type),
                    background: `${typeColor(activeFinding.type)}1A`,
                    padding: '2px 6px', borderRadius: 4, flexShrink: 0,
                  }}>
                    {typeLabel(activeFinding.type)}
                  </span>
                </div>
                <div style={{
                  fontSize: 18, fontWeight: 600, color: 'var(--reform-text-primary)', lineHeight: 1.3,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>
                  {activeFinding.title}
                </div>
                <div style={{ fontSize: 13, color: 'var(--reform-text-secondary)', lineHeight: 1.6, marginTop: 8 }}>
                  {activeFinding.description}
                </div>
                <div style={{ borderLeft: '2px solid var(--reform-purple)', background: 'var(--reform-purple-dim)', borderRadius: '0 6px 6px 0', padding: '8px 12px', marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#A78BFA', marginBottom: 3 }}>{activeFinding.principle}</div>
                  <div style={{ fontSize: 11, color: 'rgba(167,139,250,0.7)', lineHeight: 1.5 }}>{activeFinding.principleExplanation}</div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--reform-text-muted)', marginBottom: 4 }}>
                    Recommendation
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--reform-text-primary)', lineHeight: 1.6 }}>{activeFinding.recommendation}</div>
                </div>


              </>
            ) : (
              <div className="shelf-empty-detail">
                <div className="shelf-empty-eyebrow">{emptyStateTitle}</div>
                <div className="shelf-empty-title">This shelf is ready for UX review.</div>
                <div className="shelf-empty-body">{emptyStateBody}</div>
                <div className="shelf-empty-note">
                  Findings will appear here with rationale, principles, and patch status once the analysis returns.
                </div>
              </div>
            )}
          </div>

          {/* Right triage column */}
          <div style={{ width: 'var(--shelf-right-width)', padding: '10px 12px', overflowY: 'auto', flexShrink: 0 }}>
            {(() => {
              const anySelected = selectedFindingIds.size > 0;
              return (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--reform-text-muted)' }}>
                      All Findings
                    </span>
                    {!isEmpty && (
                      <button
                        onClick={anySelected ? onDeselectAll : onSelectAll}
                        style={{
                          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                          fontSize: 10, color: 'rgba(168,85,247,0.7)', textAlign: 'left',
                          transition: 'color 120ms',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#c084fc')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(168,85,247,0.7)')}
                      >
                        {anySelected ? 'Deselect All' : 'Select All'}
                      </button>
                    )}
                  </div>
                  <button
                onClick={onApplySelected}
                disabled={selectedFindingIds.size === 0}
                style={{
                  fontSize: 10, fontWeight: 600, borderRadius: 6, padding: '3px 8px', cursor: selectedFindingIds.size === 0 ? 'default' : 'pointer',
                  border: 'none', transition: 'background 120ms, color 120ms',
                  background: selectedFindingIds.size === 0 ? 'rgba(255,255,255,0.05)' : '#a855f7',
                  color: selectedFindingIds.size === 0 ? 'rgba(204,195,216,0.3)' : '#fff',
                }}
              >
                {selectedFindingIds.size > 0 ? `Apply Selected (${selectedFindingIds.size})` : 'Apply Selected'}
              </button>
                </div>
              );
            })()}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {isEmpty ? (
                placeholderRows.map((label, index) => (
                  <div
                    key={label}
                    className="triage-row triage-row-placeholder"
                    data-animating={isAnimating ? 'true' : 'false'}
                    style={isAnimating ? { animationDelay: getTriageAnimationDelay(index) } : undefined}
                  >
                    <div className="triage-row-placeholder-index" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="triage-row-placeholder-title ai-shimmer" />
                      <div className="triage-row-placeholder-copy">{label}</div>
                    </div>
                  </div>
                ))
              ) : (
                findings.map((f, i) => (
                  <TriageRow
                    key={f.id}
                    finding={f}
                    index={i}
                    isActive={activeFindingId === f.id}
                    isSelected={selectedFindingIds.has(f.id)}
                    onSelect={handleSelectFinding}
                    onToggleSelect={onToggleSelection}
                    onRevert={onRevertFinding}
                    onScrollToAnnotation={onScrollToAnnotation}
                    isAnimating={isAnimating}
                  />
                ))
              )}
            </div>
          </div>
        </div>
    </div>
  );
}
