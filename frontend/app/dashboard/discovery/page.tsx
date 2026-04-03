'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useProgress } from '@/components/dashboard/ProgressContext'
import { apiUrl } from '@/lib/api'

// Set to true to skip API calls and use mock data for local testing
const MOCK_MODE = false

const MOCK_DISCOVERY: DiscoveryData = {
  project_category: 'SaaS / Developer Tools',
  competitors: [
    { name: 'Linear', url: 'https://linear.app', reason: 'Modern issue tracking with sleek UI', relevance: 0.95 },
    { name: 'Notion', url: 'https://notion.so', reason: 'All-in-one workspace with clean design', relevance: 0.88 },
    { name: 'Vercel', url: 'https://vercel.com', reason: 'Developer-focused deployment platform', relevance: 0.85 },
    { name: 'Railway', url: 'https://railway.app', reason: 'Minimal deployment UI', relevance: 0.82 },
    { name: 'Supabase', url: 'https://supabase.com', reason: 'Open source Firebase alternative', relevance: 0.78 },
  ],
  selected_for_analysis: ['https://linear.app', 'https://vercel.com', 'https://railway.app', 'https://notion.so', 'https://supabase.com'],
}

const MOCK_ANALYSIS = {
  meta: { project_style_goal: 'minimal, dark, developer-focused', description: 'Mock analysis for local testing' },
  sources: MOCK_DISCOVERY.selected_for_analysis.map(url => ({ url, page_type: 'landing' })),
  design_tokens: {
    colors: { primary: '#7c3aed', background: '#0d0c16', surface: '#13111c', text: '#ffffff' },
    typography: { fontFamily: 'Inter', baseFontSize: '14px' },
    spacing: { unit: '4px' },
  },
}

const QUESTIONS = [
  { key: 'product_type', label: 'What are you building?', placeholder: 'e.g., Dashboard, Mobile app, SaaS platform', optional: false },
  { key: 'industry', label: 'What industry or field?', placeholder: 'e.g., Fintech, Healthcare, Education, DevTools', optional: false },
  { key: 'target_audience', label: 'Who is your target user?', placeholder: 'e.g., Developers, Small business owners, Students', optional: false },
  { key: 'core_feature', label: 'What is the core feature?', placeholder: 'e.g., AI code completion, Invoice management', optional: false },
  { key: 'competitors_known', label: 'Name any competitors you already know', placeholder: 'e.g., Linear, Notion, Stripe, Figma', optional: true },
]

interface DiscoveryData {
  project_category: string
  competitors: { name: string; url: string; reason: string; relevance: number }[]
  selected_for_analysis: string[]
}

export default function DiscoveryPage() {
  return <Suspense><DiscoveryPageInner /></Suspense>
}

function DiscoveryPageInner() {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingStatus, setLoadingStatus] = useState('')
  const [error, setError] = useState('')
  const [completed, setCompleted] = useState(false)
  const [discovery, setDiscovery] = useState<DiscoveryData | null>(null)
  const [showNotification, setShowNotification] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const repo = searchParams.get('repo')
  const { startProgress, updateProgress, finishProgress } = useProgress()

  useEffect(() => {
    if (repo) sessionStorage.setItem('refineui_repo', repo)
  }, [repo])

  useEffect(() => {
    const storedDiscovery = sessionStorage.getItem('refineui_discovery')
    const storedAnswers = sessionStorage.getItem('refineui_answers')
    if (storedDiscovery && storedAnswers) {
      setDiscovery(JSON.parse(storedDiscovery))
      setAnswers(JSON.parse(storedAnswers))
      setCompleted(true)
    }
  }, [])

  const currentQ = QUESTIONS[currentStep]
  const isLastStep = currentStep === QUESTIONS.length - 1
  const isOptional = currentQ?.optional

  function handleNext() {
    if (!isOptional && !answers[currentQ.key]?.trim()) return
    if (isLastStep) handleFullPipeline()
    else setCurrentStep(currentStep + 1)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); handleNext() }
  }

  async function handleFullPipeline() {
    setLoading(true); setError('')
    startProgress('Running full analysis pipeline...')

    if (MOCK_MODE) {
      setLoadingStatus('Mock mode: skipping crawl...')
      sessionStorage.setItem('refineui_discovery', JSON.stringify(MOCK_DISCOVERY))
      sessionStorage.setItem('refineui_analysis', JSON.stringify(MOCK_ANALYSIS))
      sessionStorage.setItem('refineui_answers', JSON.stringify(answers))
      // Don't set a default repo — let the user pick in Transform if needed
      finishProgress(); setDiscovery(MOCK_DISCOVERY); setCompleted(true); setLoading(false)
      return
    }

    const description = QUESTIONS.map(q => `${q.label} ${answers[q.key] || ''}`).join('. ')
    try {
      setLoadingStatus('Finding competitors in your space...')
      updateProgress(10)
      const discoverRes = await fetch(apiUrl('/discover-competitors'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_description: description, style_goal: '' }) })
      if (!discoverRes.ok) throw new Error('Discovery failed')
      const discoveryData = await discoverRes.json()

      setLoadingStatus(`Analyzing ${discoveryData.selected_for_analysis.length} sites with TinyFish...`)
      updateProgress(30)

      // Pass extra discovered URLs as backups in case primary ones are blocked
      const backupUrls = (discoveryData.deduped_urls || []).filter(
        (u: string) => !discoveryData.selected_for_analysis.includes(u)
      )

      // SSE streaming: get live progress as each site completes
      const analyzeUrl = apiUrl('/analyze-competitors-stream')
      const sseBody = JSON.stringify({ urls: discoveryData.selected_for_analysis, style_goal: '', backup_urls: backupUrls })
      let analysis = null

      try {
        const sseRes = await fetch(analyzeUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: sseBody })
        if (!sseRes.ok) throw new Error('Analysis failed')
        const reader = sseRes.body?.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        if (reader) {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              try {
                const evt = JSON.parse(line.slice(6))
                if (evt.event === 'site_complete') {
                  const domain = evt.url.replace('https://', '').replace(/\/$/, '')
                  const status = evt.status === 'timeout' ? ' (timed out, skipping)' : evt.status === 'failed' ? ' (blocked, skipping)' : ''
                  setLoadingStatus(`Analyzed ${domain}${status} (${evt.index}/${evt.total})`)
                  updateProgress(30 + Math.round((evt.index / evt.total) * 50))
                } else if (evt.event === 'retrying') {
                  const domain = evt.url.replace('https://', '').replace(/\/$/, '')
                  setLoadingStatus(`Trying backup: ${domain}...`)
                } else if (evt.event === 'aggregating') {
                  setLoadingStatus('Synthesizing design intelligence...')
                  updateProgress(85)
                } else if (evt.event === 'complete') {
                  analysis = evt.data
                }
              } catch { /* skip malformed events */ }
            }
          }
        }
      } catch {
        // Fallback to non-streaming endpoint (same body with backup_urls)
        const analyzeRes = await fetch(apiUrl('/analyze-competitors'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: sseBody })
        if (!analyzeRes.ok) throw new Error('Analysis failed')
        analysis = await analyzeRes.json()
      }

      if (!analysis) throw new Error('Analysis returned no data')

      updateProgress(95); setLoadingStatus('Analysis complete!')
      sessionStorage.setItem('refineui_discovery', JSON.stringify(discoveryData))
      sessionStorage.setItem('refineui_analysis', JSON.stringify(analysis))
      sessionStorage.setItem('refineui_answers', JSON.stringify(answers))
      finishProgress(); setDiscovery(discoveryData); setCompleted(true); setLoading(false); setShowNotification(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Pipeline failed')
      finishProgress(); setLoading(false)
    }
  }

  // ── COMPLETED ──
  if (completed && discovery) {
    return (
      <div className="flex items-start justify-center px-4 sm:px-6 py-8 sm:py-12">
        {/* Success notification popup */}
        {showNotification && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
            <div className="rounded-2xl p-8 max-w-md w-full mx-4 text-center animate-in fade-in zoom-in duration-300" style={{ background: 'linear-gradient(180deg, rgba(30,27,46,1) 0%, rgba(19,17,28,1) 100%)', border: '1px solid rgba(168,85,247,0.2)', boxShadow: '0 0 60px rgba(124,58,237,0.15)' }}>
              <div className="w-14 h-14 rounded-full mx-auto mb-5 flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Analysis Complete!</h2>
              <p className="text-[14px] mb-6" style={{ color: 'rgba(255,255,255,0.5)', lineHeight: '1.6' }}>
                We&apos;ve successfully analyzed your competitors, let us help you beat them.
              </p>
              <button
                onClick={() => setShowNotification(false)}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', boxShadow: '0 0 30px rgba(124,58,237,0.25)' }}
              >
                Let&apos;s Go
              </button>
            </div>
          </div>
        )}

        <div className="w-full max-w-4xl space-y-6">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-3">Project Discovery</h1>
            <div className="flex items-center justify-center gap-3">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.15)' }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#22c55e' }} />
                <span className="text-[11px] font-medium" style={{ color: '#86efac' }}>Complete</span>
              </div>
              <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.25)' }}>{discovery.project_category} · {discovery.competitors.length} competitors</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            {/* Project Brief */}
            <div className="lg:col-span-3 rounded-xl p-6" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <h3 className="text-[11px] font-medium uppercase tracking-wider mb-5" style={{ color: 'rgba(255,255,255,0.3)' }}>Project Brief</h3>
              <div className="space-y-0">
                {QUESTIONS.map((q) => (
                  <div key={q.key} className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{q.label}</span>
                    <span className="text-[13px] font-medium text-white">{answers[q.key] || '—'}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Competitors + CTA */}
            <div className="lg:col-span-2 space-y-5">
              <div className="rounded-xl p-6" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>Top Competitors</h3>
                  <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>{discovery.selected_for_analysis.length} analyzed</span>
                </div>
                <div className="space-y-0">
                  {discovery.competitors.slice(0, 3).map((c, i) => (
                    <div key={i} className="flex items-center justify-between py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <div className="flex items-center gap-2.5">
                        <span className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-semibold" style={{ background: 'rgba(168,85,247,0.1)', color: 'rgba(168,85,247,0.7)' }}>{i + 1}</span>
                        <span className="text-[13px] font-medium text-white">{c.name}</span>
                      </div>
                      <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.2)' }}>{(c.relevance * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => router.push('/dashboard/transform')}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', boxShadow: '0 0 30px rgba(124,58,237,0.2)' }}
              >
                View Transformation →
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            {[
              { label: 'Competitors Found', value: discovery.competitors.length.toString(), sub: 'in category' },
              { label: 'Sites Analyzed', value: discovery.selected_for_analysis.length.toString(), sub: 'with TinyFish' },
              { label: 'Avg Relevance', value: `${Math.round(discovery.competitors.slice(0, 3).reduce((a, c) => a + c.relevance, 0) / 3 * 100)}%`, sub: 'top 3 match' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-2xl font-bold text-white mb-1">{stat.value}</p>
                <p className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>{stat.label}</p>
                <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.15)' }}>{stat.sub}</p>
              </div>
            ))}
          </div>

          {/* Full competitor list */}
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <h3 className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.3)' }}>All Discovered Competitors</h3>
              <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.15)' }}>{discovery.competitors.length} total</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {discovery.competitors.slice(0, 15).map((c, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', borderRight: '1px solid rgba(255,255,255,0.03)' }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[9px] font-mono w-4 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.15)' }}>{i + 1}</span>
                    <span className="text-[12px] font-medium text-white truncate">{c.name}</span>
                  </div>
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-[9px] font-mono flex-shrink-0 ml-2" style={{ color: 'rgba(168,85,247,0.5)' }}>
                    {c.url.replace('https://', '').replace(/\/$/, '').substring(0, 20)}
                  </a>
                </div>
              ))}
            </div>
            {discovery.competitors.length > 15 && (
              <div className="px-5 py-2 text-center" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.15)' }}>+ {discovery.competitors.length - 15} more competitors discovered</span>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── LOADING ──
  if (loading) {
    const STAGES = [
      { label: 'Finding competitors in your space...', est: 10 },
      { label: 'Analyzing sites with TinyFish...', est: 30 },
      { label: 'Synthesizing design intelligence...', est: 5 },
    ]
    const currentStage = STAGES.find(s => loadingStatus.toLowerCase().includes(s.label.split('...')[0].toLowerCase().slice(0, 10))) || STAGES[0]
    const stageIdx = STAGES.indexOf(currentStage)
    const completedEst = STAGES.slice(0, stageIdx).reduce((a, s) => a + s.est, 0)
    const totalEst = STAGES.reduce((a, s) => a + s.est, 0)
    const progressPct = Math.min(95, ((completedEst + currentStage.est * 0.5) / totalEst) * 100)

    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="w-full max-w-md px-6">
          <div className="text-center mb-8">
            <h2 className="text-xl font-bold text-white mb-2">Analyzing Your Space</h2>
            <p className="text-[13px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{loadingStatus}</p>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1.5 rounded-full mb-4" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, #7c3aed, #a855f7)', boxShadow: '0 0 12px rgba(168,85,247,0.3)' }}
            />
          </div>

          {/* Stages */}
          <div className="space-y-2.5">
            {STAGES.map((stage, i) => {
              const isDone = i < stageIdx
              const isActive = i === stageIdx
              return (
                <div key={i} className="flex items-center gap-3">
                  {isDone ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  ) : isActive ? (
                    <div className="w-3.5 h-3.5 rounded-full animate-spin" style={{ border: '2px solid rgba(168,85,247,0.2)', borderTopColor: '#a855f7' }} />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
                  )}
                  <span className="text-[12px]" style={{ color: isActive ? 'rgba(255,255,255,0.7)' : isDone ? 'rgba(34,197,94,0.6)' : 'rgba(255,255,255,0.2)' }}>
                    {stage.label}
                  </span>
                  <span className="text-[10px] font-mono ml-auto" style={{ color: 'rgba(255,255,255,0.15)' }}>
                    ~{stage.est}s
                  </span>
                </div>
              )
            })}
          </div>

          <p className="text-[10px] text-center mt-6" style={{ color: 'rgba(255,255,255,0.2)' }}>
            Estimated total: ~{totalEst}s — TinyFish browses each site in a real browser
          </p>
        </div>
      </div>
    )
  }

  // ── QUESTIONNAIRE ──
  return (
    <div className="flex items-center justify-center min-h-[70vh] px-6">
      <div className="w-full max-w-lg">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">Project Discovery</h1>
          <p className="text-[13px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Answer a few questions to find the best design references.</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-medium" style={{ color: 'rgba(255,255,255,0.25)' }}>Question {currentStep + 1} of {QUESTIONS.length}</span>
          <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.15)' }}>{Math.round(((currentStep + 1) / QUESTIONS.length) * 100)}%</span>
        </div>
        <div className="w-full h-[2px] rounded-full mb-8" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${((currentStep + 1) / QUESTIONS.length) * 100}%`, background: 'linear-gradient(90deg, #7c3aed, #a855f7)' }} />
        </div>

        {/* Question */}
        <div className="rounded-xl p-6" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <label className="block text-white font-semibold text-lg mb-4">{currentQ.label}</label>
          <input
            autoFocus
            type="text"
            placeholder={currentQ.placeholder}
            value={answers[currentQ.key] || ''}
            onChange={(e) => setAnswers({ ...answers, [currentQ.key]: e.target.value })}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent px-4 py-3 text-sm outline-none rounded-lg"
            style={{ color: 'white', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}
          />

          <div className="flex items-center gap-3 mt-5">
            {currentStep > 0 && (
              <button onClick={() => setCurrentStep(currentStep - 1)} className="px-4 py-2 rounded-lg text-[12px] font-medium" style={{ color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={!isOptional && !answers[currentQ.key]?.trim()}
              className="px-5 py-2 rounded-lg text-[12px] font-semibold transition-all active:scale-[0.98]"
              style={{
                background: (isOptional || answers[currentQ.key]?.trim()) ? 'linear-gradient(135deg, #7c3aed, #6d28d9)' : 'rgba(255,255,255,0.04)',
                color: (isOptional || answers[currentQ.key]?.trim()) ? 'white' : 'rgba(255,255,255,0.2)',
                boxShadow: (isOptional || answers[currentQ.key]?.trim()) ? '0 0 20px rgba(124,58,237,0.15)' : 'none',
              }}
            >
              {isLastStep ? 'Discover Competitors' : 'Next'}
            </button>
            {isOptional && !answers[currentQ.key]?.trim() && (
              <button onClick={handleNext} className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.25)' }}>Skip</button>
            )}
            <span className="text-[10px] ml-auto" style={{ color: 'rgba(255,255,255,0.15)' }}>Enter ↵</span>
          </div>
        </div>

        {/* Previous answers */}
        {currentStep > 0 && (
          <div className="mt-6 space-y-1">
            {QUESTIONS.slice(0, currentStep).map((q) => (
              <div key={q.key} className="flex items-center justify-between py-2 px-3 rounded-lg cursor-pointer transition-colors hover:bg-white/[0.02]" onClick={() => setCurrentStep(QUESTIONS.indexOf(q))}>
                <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.2)' }}>{q.label}</span>
                <span className="text-[11px] font-medium text-white">{answers[q.key]}</span>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="mt-4 px-4 py-3 rounded-lg text-[12px]" style={{ background: 'rgba(239,68,68,0.08)', color: 'rgba(239,68,68,0.7)', border: '1px solid rgba(239,68,68,0.1)' }}>
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
