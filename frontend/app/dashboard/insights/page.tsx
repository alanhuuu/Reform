'use client'

import { useState } from 'react'
import { useProgress } from '@/components/dashboard/ProgressContext'
import { apiUrl } from '@/lib/api'

interface SourceAnalysis {
  url: string
  page_type: string
  summary: string
}

interface AnalysisResult {
  meta: { project_style_goal: string; description: string; confidence: { layout_patterns: number; visual_style: number; ux_flow: number } }
  sources: SourceAnalysis[]
  global_patterns: { layout: string[]; visual_style: string[]; ux_principles: string[] }
  components: Record<string, { patterns: string[] }>
  design_tokens: Record<string, unknown>
}

const BADGES = ['HIGH MATCH', 'FAST MOVER', 'COMPLEX', 'EFFICIENCY', 'PREMIUM']
const VISUAL_STYLES = ['Cyber-Minimal', 'Neo-Brutalist', 'Modern Classic', 'High Contrast', 'Gradient Play']

export default function InsightsPage() {
  const [urls, setUrls] = useState('https://github.com\nhttps://linear.app\nhttps://vercel.com\nhttps://railway.app\nhttps://cursor.com')
  const [styleGoal, setStyleGoal] = useState('github_railway_hybrid')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState('')
  const { startProgress, finishProgress } = useProgress()

  async function handleAnalyze() {
    const urlList = urls.split('\n').map(u => u.trim()).filter(Boolean).slice(0, 5)
    if (urlList.length === 0) return
    setLoading(true)
    setError('')
    startProgress(`Analyzing ${urlList.length} sites with TinyFish...`)
    try {
      const res = await fetch(apiUrl('/analyze-competitors'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: urlList, style_goal: styleGoal }),
      })
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      setResult(await res.json())
      finishProgress()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Analysis failed')
      finishProgress()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-4 sm:px-8 py-6 sm:py-8">
      {/* Header */}
      <div className="mb-2">
        <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'rgba(204,195,216,0.5)' }}>Competitor Intelligence</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">
          {result ? `Analysis for Top ${result.sources.length} Competitors` : 'Competitor Analysis'}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'rgba(204,195,216,0.4)' }}>
          {result
            ? `${result.sources.length} sites analyzed. Design patterns extracted and ready for synthesis.`
            : 'Enter competitor URLs to extract UI/UX patterns using TinyFish.'
          }
        </p>
      </div>

      {/* Input area */}
      {!result && (
        <div className="max-w-xl mt-6 mb-8 space-y-4">
          <textarea
            rows={5}
            placeholder="Enter URLs (one per line, max 5)"
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            className="w-full rounded-xl bg-transparent px-5 py-4 text-sm outline-none resize-none font-mono"
            style={{ color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(74,68,85,0.3)', background: 'rgba(255,255,255,0.02)' }}
          />
          <input
            type="text"
            placeholder="Style goal (e.g., github_railway_hybrid)"
            value={styleGoal}
            onChange={(e) => setStyleGoal(e.target.value)}
            className="w-full rounded-xl bg-transparent px-5 py-3 text-sm outline-none"
            style={{ color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(74,68,85,0.3)', background: 'rgba(255,255,255,0.02)' }}
          />
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="px-6 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all active:scale-95"
            style={{ background: loading ? 'rgba(124,58,237,0.4)' : 'linear-gradient(135deg, #d2bbff, #7c3aed)', color: '#3f008e' }}
          >
            {loading ? 'Analyzing...' : 'Analyze with TinyFish'}
          </button>
        </div>
      )}

      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg text-sm" style={{ background: 'rgba(255,180,171,0.1)', color: '#ffb4ab' }}>
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
          {result.sources.map((source, i) => (
            <div key={i} className="rounded-xl p-6 transition-all hover:translate-y-[-2px]" style={{ background: '#1c1a25', border: '1px solid rgba(74,68,85,0.15)' }}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-white font-bold text-base">{new URL(source.url).hostname.replace('www.', '')}</h3>
                  <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: 'rgba(204,195,216,0.5)' }}>{source.page_type}</p>
                </div>
                <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase" style={{ background: 'rgba(124,58,237,0.2)', color: '#d2bbff' }}>
                  {BADGES[i % BADGES.length]}
                </span>
              </div>

              {/* Mock preview */}
              <div className="rounded-lg mb-4 overflow-hidden" style={{ background: '#0f0d18', height: '120px', border: '1px solid rgba(74,68,85,0.1)' }}>
                <div className="p-3 space-y-2">
                  <div className="h-2 w-1/2 rounded" style={{ background: 'rgba(255,255,255,0.08)' }} />
                  <div className="h-2 w-3/4 rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />
                  <div className="h-8 w-full rounded mt-2" style={{ background: 'rgba(255,255,255,0.03)' }} />
                  <div className="flex gap-2 mt-1">
                    <div className="h-4 w-12 rounded" style={{ background: 'rgba(124,58,237,0.2)' }} />
                    <div className="h-4 w-12 rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
                  </div>
                </div>
              </div>

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <p className="text-[9px] uppercase tracking-widest font-bold" style={{ color: 'rgba(204,195,216,0.4)' }}>Layout Type</p>
                  <p className="text-xs text-white font-medium mt-0.5">{result.global_patterns.layout[i % result.global_patterns.layout.length]?.replace(/_/g, ' ') || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-widest font-bold" style={{ color: 'rgba(204,195,216,0.4)' }}>Visual Style</p>
                  <p className="text-xs text-white font-medium mt-0.5">{VISUAL_STYLES[i % VISUAL_STYLES.length]}</p>
                </div>
              </div>

              <div className="mb-4">
                <p className="text-[9px] uppercase tracking-widest font-bold mb-2" style={{ color: 'rgba(204,195,216,0.4)' }}>Key Components</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.keys(result.components).slice(0, 3).map((comp) => (
                    <span key={comp} className="px-2 py-0.5 rounded text-[10px]" style={{ background: 'rgba(124,58,237,0.1)', color: '#ddb7ff', border: '1px solid rgba(124,58,237,0.2)' }}>
                      {comp.replace('_', ' ')}
                    </span>
                  ))}
                </div>
              </div>

              <button className="w-full py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors" style={{ color: '#d2bbff', border: '1px solid rgba(74,68,85,0.2)' }}>
                Deep Dive
              </button>
            </div>
          ))}

        </div>
      )}
    </div>
  )
}
