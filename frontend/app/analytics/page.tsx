'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Lock, RefreshCw, Users, BarChart3, Globe, Activity,
  Clock, Zap, Target, TrendingUp, Eye, Radio,
} from 'lucide-react'
import { apiUrl } from '@/lib/api'

// ── Types ──────────────────────────────────────────────────────────────

interface AnalyticsData {
  users: {
    total: number
    by_plan: Record<string, number>
    by_status: Record<string, number>
    new_last_30d: number
    signups_per_day: { date: string; count: number }[]
  }
  usage: {
    total_scans: number
    total_repos: number
    total_projects: number
    total_runs: number
    runs_by_status: Record<string, number>
    total_pages_found: number
    total_pages_transformed: number
    total_pages_skipped: number
    avg_page_score: number
    runs_per_day: { date: string; count: number }[]
  }
  site_visits: {
    total_visits: number
    total_time_minutes: number
    avg_session_seconds: number
  }
  active?: {
    count: number
    paths: Record<string, number>
  }
}

const PASSWORD = 'password123'
const POLL_INTERVAL = 10_000

// ── Shared styles ──────────────────────────────────────────────────────

const card = {
  background: 'linear-gradient(180deg, rgba(13,17,26,0.92) 0%, rgba(9,12,19,0.88) 100%)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 24,
  boxShadow: '0 1px 0 rgba(255,255,255,0.03) inset, 0 16px 48px rgba(0,0,0,0.32)',
  backdropFilter: 'blur(20px)',
} as const

const eyebrow = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.12em',
  color: 'var(--color-text-tertiary, rgba(235,241,255,0.4))',
} as const

// ── Metric Card ────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, icon: Icon, accent }: {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  accent?: string
}) {
  return (
    <div className="group" style={{
      ...card,
      padding: '28px 24px',
      transition: 'border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease',
      cursor: 'default',
      position: 'relative',
      overflow: 'hidden',
    }}
    onMouseEnter={(e) => {
      const el = e.currentTarget
      el.style.borderColor = 'rgba(255,255,255,0.12)'
      el.style.transform = 'translateY(-1px)'
      el.style.boxShadow = '0 1px 0 rgba(255,255,255,0.04) inset, 0 20px 60px rgba(0,0,0,0.4)'
    }}
    onMouseLeave={(e) => {
      const el = e.currentTarget
      el.style.borderColor = 'rgba(255,255,255,0.07)'
      el.style.transform = 'translateY(0)'
      el.style.boxShadow = '0 1px 0 rgba(255,255,255,0.03) inset, 0 16px 48px rgba(0,0,0,0.32)'
    }}
    >
      {accent && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
          opacity: 0.5,
        }} />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: accent ? `${accent}10` : 'rgba(255,255,255,0.04)',
          border: `1px solid ${accent ? `${accent}20` : 'rgba(255,255,255,0.06)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Icon size={14} style={{ color: accent || 'rgba(235,241,255,0.4)' }} />
        </div>
        <span style={eyebrow}>{label}</span>
      </div>
      <div style={{
        fontSize: 36,
        fontWeight: 800,
        color: '#f5f7fb',
        lineHeight: 1,
        letterSpacing: '-0.035em',
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontSize: 12,
          color: 'var(--color-text-muted, rgba(235,241,255,0.24))',
          marginTop: 8,
          fontFamily: 'var(--font-mono)',
        }}>
          {sub}
        </div>
      )}
    </div>
  )
}

// ── Segmented Bar ──────────────────────────────────────────────────────

function SegmentedBar({ segments, label }: {
  segments: { name: string; value: number; color: string }[]
  label: string
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)

  return (
    <div style={{ ...card, padding: '28px 24px' }}>
      <div style={{ ...eyebrow, marginBottom: 20 }}>{label}</div>
      {total === 0 ? (
        <div style={{ fontSize: 13, color: 'rgba(235,241,255,0.24)' }}>No data</div>
      ) : (
        <>
          <div style={{
            display: 'flex',
            height: 6,
            borderRadius: 9999,
            overflow: 'hidden',
            gap: 2,
            background: 'rgba(255,255,255,0.04)',
          }}>
            {segments.filter(s => s.value > 0).map((seg) => (
              <div key={seg.name} style={{
                flex: seg.value,
                background: seg.color,
                borderRadius: 9999,
                transition: 'flex 0.5s ease',
              }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 20, marginTop: 16, flexWrap: 'wrap' }}>
            {segments.map((seg) => (
              <div key={seg.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: seg.color,
                  boxShadow: seg.value > 0 ? `0 0 8px ${seg.color}40` : 'none',
                }} />
                <span style={{
                  fontSize: 12,
                  color: 'var(--color-text-secondary, rgba(235,241,255,0.64))',
                }}>
                  {seg.name}
                </span>
                <span style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#f5f7fb',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {seg.value}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Spark Chart ────────────────────────────────────────────────────────

function SparkChart({ data, label, color = '#7c8cff', total }: {
  data: { date: string; count: number }[]
  label: string
  color?: string
  total?: number
}) {
  const max = Math.max(...data.map((d) => d.count), 1)

  return (
    <div style={{ ...card, padding: '28px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div style={eyebrow}>{label}</div>
        {total !== undefined && (
          <span style={{
            fontSize: 13,
            fontWeight: 700,
            color: '#f5f7fb',
            fontFamily: 'var(--font-mono)',
          }}>
            {total} total
          </span>
        )}
      </div>
      {data.length === 0 ? (
        <div style={{
          height: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(235,241,255,0.2)',
          fontSize: 13,
        }}>
          No data yet
        </div>
      ) : (
        <>
          <div style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 2,
            height: 100,
            padding: '0 2px',
          }}>
            {data.map((d) => (
              <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div
                  title={`${d.date}: ${d.count}`}
                  style={{
                    width: '100%',
                    maxWidth: 20,
                    height: `${Math.max((d.count / max) * 100, d.count > 0 ? 6 : 2)}%`,
                    background: d.count > 0
                      ? `linear-gradient(180deg, ${color} 0%, ${color}80 100%)`
                      : 'rgba(255,255,255,0.04)',
                    borderRadius: 4,
                    transition: 'height 0.5s ease',
                    boxShadow: d.count > 0 ? `0 0 12px ${color}30` : 'none',
                  }}
                />
              </div>
            ))}
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 12,
            borderTop: '1px solid rgba(255,255,255,0.04)',
            paddingTop: 10,
          }}>
            <span style={{ fontSize: 10, color: 'rgba(235,241,255,0.24)', fontFamily: 'var(--font-mono)' }}>
              {data[0]?.date.slice(5)}
            </span>
            <span style={{ fontSize: 10, color: 'rgba(235,241,255,0.24)', fontFamily: 'var(--font-mono)' }}>
              {data[data.length - 1]?.date.slice(5)}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

// ── Format helpers ─────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${(seconds / 3600).toFixed(1)}h`
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`
  return `${(minutes / 60).toFixed(1)}h`
}

// ── Main Page ──────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [live, setLive] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('analytics_auth') === 'true') {
      setAuthenticated(true)
    }
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(apiUrl(`/analytics/overview?password=${PASSWORD}`))
      if (!res.ok) throw new Error('Failed to fetch')
      const json = await res.json()
      setData(json)
      setLastUpdated(new Date())
    } catch {
      // keep existing data on error
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch + live polling
  useEffect(() => {
    if (!authenticated) return

    fetchData()

    if (live) {
      intervalRef.current = setInterval(fetchData, POLL_INTERVAL)
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [authenticated, live, fetchData])

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    if (password === PASSWORD) {
      sessionStorage.setItem('analytics_auth', 'true')
      setAuthenticated(true)
      setError('')
    } else {
      setError('Wrong password')
    }
  }

  // ── Password gate ────────────────────────────────────────────────────

  if (!authenticated) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'radial-gradient(circle at 50% 30%, rgba(124,140,255,0.08), transparent 50%), #05070c',
      }}>
        <form
          onSubmit={handleLogin}
          style={{
            ...card,
            padding: '48px 40px',
            width: '100%',
            maxWidth: 400,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Top accent line */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: '20%',
            right: '20%',
            height: 1,
            background: 'linear-gradient(90deg, transparent, #7c8cff, transparent)',
            opacity: 0.6,
          }} />

          <div style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: 'rgba(124,140,255,0.08)',
            border: '1px solid rgba(124,140,255,0.16)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 28,
          }}>
            <Lock size={20} style={{ color: '#7c8cff' }} />
          </div>

          <h1 style={{
            fontSize: 22,
            fontWeight: 800,
            color: '#f5f7fb',
            letterSpacing: '-0.02em',
            marginBottom: 6,
          }}>
            Analytics
          </h1>
          <p style={{
            fontSize: 14,
            color: 'var(--color-text-secondary, rgba(235,241,255,0.64))',
            marginBottom: 28,
          }}>
            Enter the admin password to continue.
          </p>

          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError('') }}
            placeholder="Password"
            autoFocus
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: 12,
              border: error ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.04)',
              color: '#f5f7fb',
              fontSize: 14,
              outline: 'none',
              marginBottom: error ? 8 : 16,
              transition: 'border-color 0.2s ease',
            }}
            onFocus={(e) => {
              if (!error) e.currentTarget.style.borderColor = 'rgba(124,140,255,0.4)'
            }}
            onBlur={(e) => {
              if (!error) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
            }}
          />

          {error && (
            <p style={{
              fontSize: 12,
              color: '#ff6b6b',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            style={{
              width: '100%',
              padding: '12px 0',
              borderRadius: 14,
              border: '1px solid rgba(170,180,255,0.2)',
              background: 'linear-gradient(135deg, #aab4ff 0%, #7c8cff 40%, #5666f5 100%)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 12px 32px rgba(86,102,245,0.2), inset 0 1px 0 rgba(255,255,255,0.16)',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = '0 16px 40px rgba(86,102,245,0.28), inset 0 1px 0 rgba(255,255,255,0.2)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 12px 32px rgba(86,102,245,0.2), inset 0 1px 0 rgba(255,255,255,0.16)'
            }}
          >
            Continue
          </button>
        </form>
      </div>
    )
  }

  // ── Dashboard ────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at top, rgba(124,140,255,0.06), transparent 40%), #05070c',
      position: 'relative',
    }}>
      {/* Background grid */}
      <div style={{
        position: 'fixed',
        inset: 0,
        backgroundImage:
          'linear-gradient(to right, transparent 0, transparent calc(100% - 1px), rgba(255,255,255,0.025) calc(100% - 1px)), linear-gradient(to bottom, transparent 0, transparent calc(100% - 1px), rgba(255,255,255,0.025) calc(100% - 1px))',
        backgroundSize: '72px 72px',
        maskImage: 'radial-gradient(circle at center, black 30%, transparent 80%)',
        opacity: 0.4,
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', maxWidth: 1200, margin: '0 auto', padding: '40px 28px 80px' }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 48,
          paddingBottom: 24,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div>
            <h1 style={{
              fontSize: 28,
              fontWeight: 800,
              color: '#f5f7fb',
              letterSpacing: '-0.035em',
              lineHeight: 1,
            }}>
              Analytics
            </h1>
            <p style={{
              fontSize: 13,
              color: 'var(--color-text-tertiary, rgba(235,241,255,0.4))',
              marginTop: 8,
            }}>
              {lastUpdated && (
                <span>
                  Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Live toggle */}
            <button
              onClick={() => setLive(!live)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 16px',
                borderRadius: 12,
                border: live ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(255,255,255,0.07)',
                background: live ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.03)',
                color: live ? '#86efac' : 'rgba(235,241,255,0.4)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: live ? '#22c55e' : 'rgba(255,255,255,0.2)',
                boxShadow: live ? '0 0 8px rgba(34,197,94,0.5)' : 'none',
                animation: live ? 'pulse 2s ease-in-out infinite' : 'none',
              }} />
              {live ? 'Live' : 'Paused'}
            </button>

            {/* Refresh */}
            <button
              onClick={fetchData}
              disabled={loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.07)',
                background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
                color: 'var(--color-text-secondary, rgba(235,241,255,0.64))',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.025)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(124,140,255,0.24)'
                e.currentTarget.style.background = 'rgba(124,140,255,0.06)'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
                e.currentTarget.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {!data && loading ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            paddingTop: 120,
            gap: 16,
          }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: '2px solid rgba(124,140,255,0.15)',
              borderTopColor: '#7c8cff',
              animation: 'spin 1s linear infinite',
            }} />
            <span style={{ fontSize: 13, color: 'rgba(235,241,255,0.4)' }}>Loading analytics...</span>
          </div>
        ) : !data ? (
          <div style={{ textAlign: 'center', color: 'rgba(235,241,255,0.24)', paddingTop: 120 }}>
            Unable to load data
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>

            {/* ── Active Now ────────────────────────────────── */}
            <section>
              <div style={{
                ...card,
                padding: '28px 24px',
                position: 'relative',
                overflow: 'hidden',
                borderColor: (data.active?.count ?? 0) > 0 ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.07)',
              }}>
                {(data.active?.count ?? 0) > 0 && (
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 1,
                    background: 'linear-gradient(90deg, transparent, #22c55e, transparent)',
                    opacity: 0.5,
                  }} />
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: (data.active?.count ?? 0) > 0 ? '#22c55e' : 'rgba(255,255,255,0.15)',
                      boxShadow: (data.active?.count ?? 0) > 0 ? '0 0 12px rgba(34,197,94,0.5), 0 0 24px rgba(34,197,94,0.2)' : 'none',
                      animation: (data.active?.count ?? 0) > 0 ? 'pulse 2s ease-in-out infinite' : 'none',
                    }} />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                        <span style={{ fontSize: 32, fontWeight: 800, color: '#f5f7fb', letterSpacing: '-0.035em' }}>
                          {data.active?.count ?? 0}
                        </span>
                        <span style={{ fontSize: 14, color: 'var(--color-text-secondary, rgba(235,241,255,0.64))' }}>
                          {(data.active?.count ?? 0) === 1 ? 'user' : 'users'} online now
                        </span>
                      </div>
                    </div>
                  </div>
                  {Object.keys(data.active?.paths ?? {}).length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {Object.entries(data.active?.paths ?? {}).map(([path, count]) => (
                        <span key={path} style={{
                          fontSize: 11,
                          fontFamily: 'var(--font-mono)',
                          padding: '4px 10px',
                          borderRadius: 8,
                          background: 'rgba(34,197,94,0.06)',
                          border: '1px solid rgba(34,197,94,0.12)',
                          color: '#86efac',
                        }}>
                          {path} <span style={{ color: 'rgba(255,255,255,0.4)' }}>({count})</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* ── Users ─────────────────────────────────────── */}
            <section>
              <div style={{ ...eyebrow, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={12} />
                Users
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 12,
              }}>
                <MetricCard label="Total Users" value={data.users.total} icon={Users} accent="#7c8cff" />
                <MetricCard label="New (30d)" value={data.users.new_last_30d} icon={TrendingUp} accent="#22c55e" />
                <SegmentedBar
                  label="Distribution by Plan"
                  segments={[
                    { name: 'Free', value: data.users.by_plan.free || 0, color: '#52525b' },
                    { name: 'Pro', value: data.users.by_plan.pro || 0, color: '#7c8cff' },
                    { name: 'Max', value: data.users.by_plan.max || 0, color: '#a855f7' },
                  ]}
                />
                <SegmentedBar
                  label="Subscription Status"
                  segments={[
                    { name: 'Active', value: data.users.by_status.active || 0, color: '#22c55e' },
                    { name: 'Canceled', value: data.users.by_status.canceled || 0, color: '#ef4444' },
                    { name: 'Past Due', value: data.users.by_status.past_due || 0, color: '#eab308' },
                  ]}
                />
              </div>
            </section>

            {/* ── Usage ─────────────────────────────────────── */}
            <section>
              <div style={{ ...eyebrow, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={12} />
                Usage
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 12,
              }}>
                <MetricCard label="Total Scans" value={data.usage.total_scans} icon={Zap} accent="#eab308" />
                <MetricCard label="Repos Connected" value={data.usage.total_repos} icon={Globe} accent="#7c8cff" />
                <MetricCard label="Projects" value={data.usage.total_projects} icon={BarChart3} accent="#a855f7" />
              </div>
            </section>

            {/* ── Transforms ────────────────────────────────── */}
            <section>
              <div style={{ ...eyebrow, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Activity size={12} />
                Transforms
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 12,
              }}>
                <MetricCard label="Total Runs" value={data.usage.total_runs} icon={Activity} accent="#7c8cff" />
                <MetricCard
                  label="Pages Transformed"
                  value={data.usage.total_pages_transformed}
                  sub={`${data.usage.total_pages_found} found / ${data.usage.total_pages_skipped} skipped`}
                  icon={Target}
                  accent="#22c55e"
                />
                <MetricCard
                  label="Avg Score"
                  value={data.usage.avg_page_score}
                  sub="out of 100"
                  icon={TrendingUp}
                  accent={data.usage.avg_page_score >= 70 ? '#22c55e' : data.usage.avg_page_score >= 40 ? '#eab308' : '#ef4444'}
                />
                <SegmentedBar
                  label="Run Status"
                  segments={[
                    { name: 'Complete', value: data.usage.runs_by_status.complete || 0, color: '#22c55e' },
                    { name: 'Running', value: data.usage.runs_by_status.running || 0, color: '#eab308' },
                    { name: 'Failed', value: data.usage.runs_by_status.failed || 0, color: '#ef4444' },
                  ]}
                />
              </div>
            </section>

            {/* ── Site Visits ───────────────────────────────── */}
            <section>
              <div style={{ ...eyebrow, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Eye size={12} />
                Site Visits
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 12,
              }}>
                <MetricCard label="Total Visits" value={data.site_visits.total_visits} icon={Eye} accent="#7c8cff" />
                <MetricCard
                  label="Total Time"
                  value={formatMinutes(data.site_visits.total_time_minutes)}
                  icon={Clock}
                  accent="#a855f7"
                />
                <MetricCard
                  label="Avg Session"
                  value={formatDuration(data.site_visits.avg_session_seconds)}
                  icon={Clock}
                  accent="#eab308"
                />
              </div>
            </section>

            {/* ── Activity Charts ───────────────────────────── */}
            <section>
              <div style={{ ...eyebrow, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Radio size={12} />
                Activity &mdash; Last 30 Days
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
                gap: 12,
              }}>
                <SparkChart
                  data={data.users.signups_per_day}
                  label="Signups"
                  color="#7c8cff"
                  total={data.users.new_last_30d}
                />
                <SparkChart
                  data={data.usage.runs_per_day}
                  label="Transform Runs"
                  color="#a855f7"
                  total={data.usage.runs_per_day.reduce((s, d) => s + d.count, 0)}
                />
              </div>
            </section>
          </div>
        )}
      </div>

      {/* Inline keyframes */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
