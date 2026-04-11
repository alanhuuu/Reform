'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
// Editor import removed — Code Editor tab eliminated in favor of no-code flow
import { apiUrl } from '@/lib/api'
import { getSelectedRepo, setSelectedRepo } from '@/lib/selectedRepo'
import { useSubscription } from '@/lib/useSubscription'
import UpgradeBanner from '@/components/dashboard/UpgradeBanner'
import GateErrorBanner, { parseResponseError, type GateErrorData } from '@/components/dashboard/GateError'
import TransformSummaryHeader from '@/components/dashboard/TransformSummaryHeader'
import TransformCarousel from '@/components/dashboard/TransformCarousel'
import RepoWideImprovementsPanel from '@/components/dashboard/RepoWideImprovementsPanel'
import { adaptLegacyResult } from '@/components/dashboard/TransformTypes'
import type { MultiPageTransformResult } from '@/components/dashboard/TransformTypes'

interface CommitEntry {
  hash: string
  msg: string
  color: string
  status: 'accepted' | 'rejected' | 'pending'
  code?: string
  suggestion?: string
}

const INITIAL_COMMITS: CommitEntry[] = []

interface AnalysisData {
  meta: { project_style_goal: string; description: string }
  sources: { url: string; page_type: string }[]
  design_tokens: Record<string, unknown>
}

interface TransformData {
  refined_ui: Record<string, unknown>
  code: string
}
interface FileEntry { path: string; content: string; size: number }
interface ComponentInfo { name: string; file_path: string; type: string; description: string }
interface CodeAnalysis {
  entry_points: string[]; layout_files: string[]; components: ComponentInfo[]
  dependency_map: Record<string, string[]>; recommended_target: string; target_reason: string
}
interface ChangeAnnotation { region: string; change_type: string; description: string; ux_impact: string }
interface TransformResult {
  transformed_files: { path: string; original_code: string; updated_code: string; diff_summary: string }[]
  change_annotations: ChangeAnnotation[]; change_summary: string[]
  before_screenshot: string; after_screenshot: string
  preview_route: string; preview_error?: string
}
interface GithubRepo {
  id: number; full_name: string; name: string; private: boolean
  language: string | null; updated_at: string; default_branch: string
  homepage: string | null; html_url: string
}
type PipelineStep = 'idle' | 'ingesting' | 'analyzing' | 'transforming' | 'complete'

const PIPELINE_STAGES = [
  { key: 'ingesting', label: 'Analyzing & transforming pages', duration: 240 },
]

function PipelineProgress({ step, repoName, targetFile }: { step: PipelineStep; repoName: string; targetFile: string }) {
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(Date.now())

  useEffect(() => { startRef.current = Date.now(); setElapsed(0) }, [step])

  useEffect(() => {
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000)
    return () => clearInterval(interval)
  }, [step])

  const currentIdx = PIPELINE_STAGES.findIndex(s => s.key === step)
  const currentStage = PIPELINE_STAGES[currentIdx]
  const totalEstimate = PIPELINE_STAGES.reduce((a, s) => a + s.duration, 0)
  const completedTime = PIPELINE_STAGES.slice(0, currentIdx).reduce((a, s) => a + s.duration, 0)
  const stageProgress = currentStage ? Math.min(elapsed / currentStage.duration, 0.95) : 0
  const overallProgress = ((completedTime + (currentStage ? stageProgress * currentStage.duration : 0)) / totalEstimate) * 100

  const subtitle = step === 'ingesting' ? `Discovering, evaluating, and transforming all pages in ${repoName}`
    : step === 'analyzing' ? 'Scoring UI quality and planning improvements'
    : 'Rendering before & after previews'

  return (
    <div className="max-w-xl mx-auto pt-6 pb-10 w-full">
      <div className="flex items-center justify-center gap-1 mb-6">
        {PIPELINE_STAGES.map((s, i) => {
          const isDone = i < currentIdx
          const isActive = s.key === step
          return (
            <div key={s.key} className="flex items-center gap-1">
              {i > 0 && <div className="w-8 h-px" style={{ background: isDone ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.06)' }} />}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{
                background: isActive ? 'rgba(168,85,247,0.1)' : isDone ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${isActive ? 'rgba(168,85,247,0.25)' : isDone ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)'}`,
              }}>
                {isDone ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                ) : isActive ? (
                  <div className="w-2.5 h-2.5 rounded-full animate-spin" style={{ border: '2px solid rgba(168,85,247,0.2)', borderTopColor: '#a855f7' }} />
                ) : (
                  <div className="w-2 h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }} />
                )}
                <span className="text-[10px] font-medium" style={{ color: isActive ? 'rgba(168,85,247,0.8)' : isDone ? 'rgba(34,197,94,0.6)' : 'rgba(255,255,255,0.2)' }}>{s.label}</span>
              </div>
            </div>
          )
        })}
      </div>
      <div className="w-full h-1 rounded-full mb-4" style={{ background: 'rgba(255,255,255,0.04)' }}>
        <div className="h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${Math.max(2, overallProgress)}%`, background: 'linear-gradient(90deg, #7c3aed, #a855f7)', boxShadow: '0 0 12px rgba(168,85,247,0.3)' }} />
      </div>
      <div className="text-center">
        <p className="text-[13px] text-white/60 mb-0.5">{subtitle}</p>
        <p className="text-[11px] font-mono" style={{ color: 'rgba(255,255,255,0.15)' }}>
          {elapsed}s elapsed · {(totalEstimate - completedTime - elapsed) > 0
            ? `~${Math.max(0, totalEstimate - completedTime - elapsed)}s remaining`
            : 'Almost done, finishing up...'}
        </p>
      </div>
    </div>
  )
}

function BrowserFrame({ children, label, accent = false }: { children: React.ReactNode; label: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-2 flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: accent ? '#a855f7' : 'rgba(255,255,255,0.2)' }} />
        <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</span>
      </div>
      <div className="rounded-xl overflow-hidden flex flex-col" style={{
        border: accent ? '1px solid rgba(168,85,247,0.3)' : '1px solid rgba(255,255,255,0.06)',
        boxShadow: accent ? '0 0 40px rgba(124,58,237,0.15)' : '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div className="border-b px-3 py-1.5 flex items-center gap-1.5" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="w-2 h-2 rounded-full bg-red-500/60" />
          <div className="w-2 h-2 rounded-full bg-amber-500/60" />
          <div className="w-2 h-2 rounded-full bg-emerald-500/60" />
        </div>
        <div style={{ background: '#0d0c16', minHeight: '280px' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

type Phase = 'idle' | 'listening' | 'thinking' | 'responding' | 'ready'

function VoiceOrb({ onFinalPrompt }: { onFinalPrompt: (prompt: string) => void }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [hasGreeted, setHasGreeted] = useState(false)
  const [orbScale, setOrbScale] = useState(1)
  const [transcript, setTranscript] = useState('')
  const [aiResponse, setAiResponse] = useState('')
  const [displayText, setDisplayText] = useState('')
  const [error, setError] = useState('')
  const [history, setHistory] = useState<{ role: string; content: string }[]>([])
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null)
  const [interpretedIntent, setInterpretedIntent] = useState('')
  const typewriterRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stoppedRef = useRef(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number>(0)
  const ttsCtxRef = useRef<AudioContext | null>(null)
  const micCtxRef = useRef<AudioContext | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const micAnalyserRef = useRef<AnalyserNode | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasSpeechRef = useRef(false)
  const historyRef = useRef<{ role: string; content: string }[]>([])
  const mountedRef = useRef(true)

  useEffect(() => { historyRef.current = history }, [history])
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const visualizeTTS = useCallback(() => {
    if (!analyserRef.current || !mountedRef.current) return
    const data = new Uint8Array(analyserRef.current.frequencyBinCount)
    analyserRef.current.getByteFrequencyData(data)
    const avg = data.reduce((a, b) => a + b, 0) / data.length / 255
    setOrbScale(1 + avg * 0.3)
    animFrameRef.current = requestAnimationFrame(visualizeTTS)
  }, [])

  const visualizeMic = useCallback(() => {
    if (!micAnalyserRef.current || !mountedRef.current) return
    const data = new Uint8Array(micAnalyserRef.current.frequencyBinCount)
    micAnalyserRef.current.getByteFrequencyData(data)
    const avg = data.reduce((a, b) => a + b, 0) / data.length / 255
    setOrbScale(1 + avg * 0.25)

    // Track if user has spoken (volume above threshold)
    if (avg > 0.05) {
      hasSpeechRef.current = true
      if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
    }

    // Silence detection: user spoke then went quiet for 1.5s → stop recording
    if (avg < 0.02 && hasSpeechRef.current) {
      if (!silenceTimerRef.current) {
        silenceTimerRef.current = setTimeout(() => {
          if (mountedRef.current && recorderRef.current?.state === 'recording') {
            recorderRef.current.stop()
          }
        }, 1500)
      }
    }

    animFrameRef.current = requestAnimationFrame(visualizeMic)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  function stopMic() {
    cancelAnimationFrame(animFrameRef.current)
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop() } catch { /* */ }
    }
    recorderRef.current = null
    if (micStreamRef.current) { micStreamRef.current.getTracks().forEach(t => t.stop()); micStreamRef.current = null }
    if (micCtxRef.current && micCtxRef.current.state !== 'closed') { micCtxRef.current.close().catch(() => {}); micCtxRef.current = null }
    micAnalyserRef.current = null
    chunksRef.current = []
  }

  function stopTTS() {
    cancelAnimationFrame(animFrameRef.current)
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.onended = null; audioRef.current = null }
    if (ttsCtxRef.current && ttsCtxRef.current.state !== 'closed') { ttsCtxRef.current.close().catch(() => {}); ttsCtxRef.current = null }
    analyserRef.current = null
  }

  async function startListening() {
    if (!mountedRef.current) return
    stoppedRef.current = false
    stopMic()
    setError('')
    setTranscript('')
    chunksRef.current = []
    hasSpeechRef.current = false

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (e) {
      setError(`Mic: ${e instanceof Error ? e.message : 'denied'}`)
      setPhase('idle')
      return
    }
    if (!mountedRef.current) { stream.getTracks().forEach(t => t.stop()); return }
    micStreamRef.current = stream
    setPhase('listening')

    // Visualizer
    try {
      const ctx = new AudioContext()
      micCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      micAnalyserRef.current = analyser
      animFrameRef.current = requestAnimationFrame(visualizeMic)
    } catch { /* */ }

    // MediaRecorder — works in ALL browsers
    try {
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : 'audio/mp4'

      const recorder = new MediaRecorder(stream, { mimeType })
      recorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        // Stop mic stream and visualizer immediately
        cancelAnimationFrame(animFrameRef.current)
        if (micStreamRef.current) { micStreamRef.current.getTracks().forEach(t => t.stop()); micStreamRef.current = null }
        if (micCtxRef.current && micCtxRef.current.state !== 'closed') { micCtxRef.current.close().catch(() => {}); micCtxRef.current = null }
        micAnalyserRef.current = null

        if (chunksRef.current.length === 0) { setPhase('idle'); return }
        const blob = new Blob(chunksRef.current, { type: mimeType })
        chunksRef.current = []

        // Only process if we're still supposed to be listening
        if (!mountedRef.current) return

        // Stop mic visuals
        cancelAnimationFrame(animFrameRef.current)
        setOrbScale(1)

        // Transcribe via backend
        setPhase('thinking')
        setTranscript('Transcribing...')

        try {
          const formData = new FormData()
          formData.append('audio', blob, `recording.${mimeType.includes('webm') ? 'webm' : 'mp4'}`)

          const res = await fetch(apiUrl('/transcribe'), {
            method: 'POST',
            body: formData,
          })

          if (!res.ok) throw new Error(`Transcribe failed: ${res.status}`)
          const data = await res.json()

          if (data.error && !data.transcript) {
            setTranscript('')
            setError(data.error)
            setPhase('idle')
            stopMic()
            return
          }

          const text = data.transcript?.trim()
          if (!text) {
            setTranscript('')
            setPhase('idle')
            stopMic()
            startListening() // no speech detected, restart
            return
          }

          setTranscript(text)
          stopMic()
          await processUserInput(text)
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Transcription failed')
          setPhase('idle')
          stopMic()
        }
      }

      recorder.start()
      setTranscript('')
      setDisplayText('Listening...')
    } catch (e) {
      setError(`Recorder: ${e instanceof Error ? e.message : 'failed'}`)
      stopMic()
      setPhase('idle')
    }
  }

  function typewrite(text: string, onDone?: () => void) {
    if (typewriterRef.current) clearTimeout(typewriterRef.current)
    setDisplayText('')
    let i = 0
    function tick() {
      if (!mountedRef.current) return
      if (i < text.length) {
        setDisplayText(text.slice(0, i + 1))
        i++
        typewriterRef.current = setTimeout(tick, 30)
      } else {
        onDone?.()
      }
    }
    tick()
  }

  async function processUserInput(userText: string) {
    setOrbScale(1)
    setPhase('thinking')
    typewrite(userText)

    const newHistory = [...historyRef.current, { role: 'user', content: userText }]
    setHistory(newHistory)

    let aiText: string
    let finalPrompt: string | null = null
    try {
      const storedAnalysis = sessionStorage.getItem('refineui_analysis')
      const analysisCtx = storedAnalysis ? JSON.parse(storedAnalysis) : null

      const res = await fetch(apiUrl('/voice-chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_message: userText,
          conversation_history: newHistory,
          analysis_context: analysisCtx,
        }),
      })

      if (!res.ok) throw new Error(`Backend: ${res.status}`)
      const data = await res.json()
      aiText = data.response
      finalPrompt = data.final_prompt || null
    } catch (e) {
      aiText = 'Sorry, I had trouble with that. What were you saying?'
      setError(e instanceof Error ? e.message : 'Backend error')
    }

    if (!mountedRef.current) return
    setAiResponse(aiText)
    setHistory(prev => [...prev, { role: 'assistant', content: aiText }])

    if (stoppedRef.current) return

    // If AI generated a final prompt, show interpreted intent for user confirmation
    if (finalPrompt) {
      setPendingPrompt(finalPrompt)
      // Extract a short intent summary from the AI response or prompt
      const intentSummary = finalPrompt.length > 80 ? finalPrompt.slice(0, 77) + '...' : finalPrompt
      setInterpretedIntent(intentSummary)
      typewrite(aiText, async () => {
        if (stoppedRef.current) return
        await playTTS(aiText)
        if (mountedRef.current && !stoppedRef.current) setPhase('ready')
      })
      return
    }

    // Otherwise continue conversation
    typewrite(aiText, async () => {
      if (stoppedRef.current) return
      await playTTS(aiText)
      if (mountedRef.current && !stoppedRef.current) startListening()
    })
  }

  async function playTTS(text: string): Promise<void> {
    if (!mountedRef.current) return
    setPhase('responding')

    try {
      const res = await fetch(apiUrl('/tts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })

      if (!res.ok) throw new Error('TTS failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)

      await new Promise<void>((resolve, reject) => {
        if (!mountedRef.current) { URL.revokeObjectURL(url); resolve(); return }

        const audio = new Audio(url)
        audioRef.current = audio

        try {
          const ctx = new AudioContext()
          ttsCtxRef.current = ctx
          const source = ctx.createMediaElementSource(audio)
          const analyser = ctx.createAnalyser()
          analyser.fftSize = 256
          source.connect(analyser)
          analyser.connect(ctx.destination)
          analyserRef.current = analyser
        } catch { /* play without visualizer */ }

        audio.onplay = () => {
          if (analyserRef.current) animFrameRef.current = requestAnimationFrame(visualizeTTS)
        }
        audio.onended = () => {
          cancelAnimationFrame(animFrameRef.current)
          setOrbScale(1)
          URL.revokeObjectURL(url)
          stopTTS()
          resolve()
        }
        audio.onerror = () => { URL.revokeObjectURL(url); stopTTS(); reject(new Error('Playback failed')) }
        audio.play().catch(reject)
      })
    } catch {
      stopTTS()
      if (mountedRef.current) setPhase('idle')
    }
  }

  async function greet() {
    const text = 'Hey! What are we designing today?'
    setAiResponse(text)
    setHistory([{ role: 'assistant', content: text }])
    typewrite(text)
    try { await playTTS(text) } catch { /* */ }
    if (mountedRef.current && !stoppedRef.current) { setPhase('idle'); startListening() }
  }

  function handleStop() {
    stoppedRef.current = true
    if (typewriterRef.current) { clearTimeout(typewriterRef.current); typewriterRef.current = null }
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
    stopMic()
    stopTTS()
    setOrbScale(1)
    setPhase('idle')
    setDisplayText('')
    setTranscript('')
  }

  function handleButtonClick() {
    if (phase === 'listening' || phase === 'responding') {
      handleStop()
    } else {
      stopTTS()
      startListening()
    }
  }

  useEffect(() => {
    if (!hasGreeted) {
      setHasGreeted(true)
      const timer = setTimeout(() => greet(), 600)
      return () => clearTimeout(timer)
    }
    return () => { stopMic(); stopTTS() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isActive = phase === 'listening' || phase === 'responding'
  const intensity = orbScale - 1

  const phaseLabel = {
    idle: 'Reform Voice',
    listening: 'Listening...',
    thinking: 'Thinking...',
    responding: 'Responding...',
    ready: 'Ready to send',
  }[phase]

  const phaseSub = {
    idle: 'Tap the mic to start talking',
    listening: 'Speak now \u2014 I\u2019ll respond when you pause',
    thinking: 'Processing your input...',
    responding: 'Reform AI is speaking',
    ready: 'Review your request below',
  }[phase]

  return (
    <div className="relative p-8 flex flex-col items-center justify-center overflow-hidden" style={{ minHeight: '340px' }}>
      <style>{`
        @keyframes blob1 {
          0%, 100% { border-radius: 42% 58% 62% 38% / 45% 55% 45% 55%; }
          25% { border-radius: 55% 45% 38% 62% / 58% 42% 58% 42%; }
          50% { border-radius: 38% 62% 55% 45% / 42% 58% 42% 58%; }
          75% { border-radius: 62% 38% 45% 55% / 55% 45% 55% 45%; }
        }
        @keyframes blob2 {
          0%, 100% { border-radius: 58% 42% 45% 55% / 62% 38% 55% 45%; }
          33% { border-radius: 45% 55% 58% 42% / 38% 62% 42% 58%; }
          66% { border-radius: 55% 45% 42% 58% / 45% 55% 62% 38%; }
        }
        @keyframes blobIdle {
          0%, 100% { border-radius: 47% 53% 51% 49% / 48% 52% 50% 50%; }
          50% { border-radius: 53% 47% 49% 51% / 52% 48% 50% 50%; }
        }
        @keyframes pulseThink {
          0%, 100% { transform: scale(1); opacity: 0.25; border-radius: 50%; }
          50% { transform: scale(1.08); opacity: 0.5; border-radius: 50%; }
        }
      `}</style>

      {/* Ambient background glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="absolute w-72 h-72 rounded-full transition-all duration-300" style={{
          background: `radial-gradient(circle, rgba(124,58,237,${isActive ? 0.06 + intensity * 0.12 : phase === 'thinking' ? 0.06 : 0.03}) 0%, transparent 70%)`,
          transform: `scale(${isActive ? 1 + intensity * 0.3 : 1})`,
        }} />
      </div>

      {/* Orb container */}
      <div className="relative mb-5">
        {/* Outer glow layer */}
        <div
          className="absolute -inset-3 transition-all duration-150"
          style={{
            borderRadius: '50%',
            background: `radial-gradient(circle, rgba(124,58,237,${isActive ? 0.08 + intensity * 0.15 : 0.03}), transparent 70%)`,
            filter: `blur(${isActive ? 12 + intensity * 15 : 8}px)`,
            transform: `scale(${1 + intensity * 0.4})`,
          }}
        />

        {/* Main orb blob */}
        <div
          className="relative w-28 h-28 flex items-center justify-center rounded-full"
          style={{
            borderRadius: '50%',
            animation: isActive
              ? `blob1 ${Math.max(0.8, 2 - intensity * 4)}s ease-in-out infinite, blob2 ${Math.max(0.6, 1.5 - intensity * 3)}s ease-in-out infinite`
              : phase === 'thinking'
                ? 'pulseThink 1.5s ease-in-out infinite'
                : 'blobIdle 4s ease-in-out infinite',
            background: isActive
              ? `radial-gradient(circle at ${45 + intensity * 10}% ${40 - intensity * 5}%, rgba(168,85,247,${0.4 + intensity * 0.5}), rgba(124,58,237,${0.2 + intensity * 0.3}) 50%, rgba(59,130,246,${0.08 + intensity * 0.15}))`
              : phase === 'thinking'
                ? 'radial-gradient(circle at 45% 40%, rgba(168,85,247,0.35), rgba(124,58,237,0.18) 55%, rgba(59,130,246,0.08))'
                : 'radial-gradient(circle at 45% 40%, rgba(168,85,247,0.25), rgba(124,58,237,0.12) 55%, rgba(59,130,246,0.06))',
            boxShadow: isActive
              ? `0 0 ${20 + intensity * 50}px rgba(124,58,237,${0.15 + intensity * 0.4}), 0 0 ${40 + intensity * 80}px rgba(124,58,237,${0.05 + intensity * 0.15}), inset 0 0 ${20 + intensity * 30}px rgba(168,85,247,${0.1 + intensity * 0.25})`
              : phase === 'thinking'
                ? '0 0 40px rgba(124,58,237,0.15), 0 0 80px rgba(124,58,237,0.06), inset 0 0 25px rgba(168,85,247,0.12)'
                : '0 0 30px rgba(124,58,237,0.1), 0 0 60px rgba(124,58,237,0.04), inset 0 0 20px rgba(168,85,247,0.08)',
            transform: `scale(${orbScale})`,
            transition: 'transform 80ms ease-out, box-shadow 150ms ease-out',
          }}
        />
      </div>

      {/* Phase label */}
      <p className="text-[14px] font-semibold text-white mb-0.5 relative">{phaseLabel}</p>

      {/* Typewriter text */}
      <p className="text-[12px] mt-2 max-w-sm text-center relative leading-relaxed" style={{
        color: phase === 'listening' ? 'rgba(255,255,255,0.5)'
          : (phase === 'responding' || phase === 'thinking') ? 'rgba(168,85,247,0.6)'
          : 'rgba(255,255,255,0.2)',
        minHeight: '18px',
      }}>
        {displayText || phaseSub}
      </p>

      {error && (
        <p className="text-[10px] mt-1 relative" style={{ color: 'rgba(239,68,68,0.5)' }}>{error}</p>
      )}

      {/* Interpreted intent card — shown in ready phase */}
      {phase === 'ready' && interpretedIntent && (
        <div className="relative mt-2 mb-3 w-full max-w-sm">
          <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.15)' }}>
            <p className="text-[9px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'rgba(168,85,247,0.6)' }}>Interpreted intent</p>
            <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>{interpretedIntent}</p>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {phase === 'ready' ? (
        <div className="flex items-center gap-2 relative">
          <button
            onClick={() => { setPendingPrompt(null); setInterpretedIntent(''); setPhase('idle'); startListening() }}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-medium transition-all active:scale-95"
            style={{ color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            </svg>
            Re-record
          </button>
          <button
            onClick={() => { if (pendingPrompt) onFinalPrompt(pendingPrompt) }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-[11px] font-semibold transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: 'white', boxShadow: '0 0 25px rgba(124,58,237,0.25)' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
            Send to AI
          </button>
        </div>
      ) : (
        <button
          onClick={handleButtonClick}
          className="flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-semibold transition-all active:scale-95 mt-1"
          style={phase === 'listening' || phase === 'responding' ? {
            background: 'rgba(239,68,68,0.1)',
            color: 'rgba(239,68,68,0.8)',
            border: '1px solid rgba(239,68,68,0.2)',
            boxShadow: '0 0 15px rgba(239,68,68,0.1)',
          } : phase === 'thinking' ? {
            background: 'rgba(168,85,247,0.05)',
            color: 'rgba(168,85,247,0.4)',
            border: '1px solid rgba(168,85,247,0.1)',
          } : {
            background: 'rgba(168,85,247,0.1)',
            color: 'rgba(168,85,247,0.8)',
            border: '1px solid rgba(168,85,247,0.2)',
            boxShadow: '0 0 15px rgba(124,58,237,0.1)',
          }}
        >
          {phase === 'listening' || phase === 'responding' ? (
            <>
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: 'rgba(239,68,68,0.8)' }} />
              Stop
            </>
          ) : phase === 'thinking' ? (
            <>
              <div className="w-3 h-3 rounded-full animate-spin" style={{ border: '2px solid rgba(168,85,247,0.15)', borderTopColor: 'rgba(168,85,247,0.5)' }} />
              Processing...
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
              Start Listening
            </>
          )}
        </button>
      )}
    </div>
  )
}

export default function TransformPageWrapper() {
  return (
    <Suspense fallback={null}>
      <TransformPage />
    </Suspense>
  )
}

function TransformPage() {
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null)
  const [transform, setTransform] = useState<TransformData | null>(null)
  const [scOpen, setScOpen] = useState(false)
  const [codeOpen, setCodeOpen] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)
  const [commits, setCommits] = useState<CommitEntry[]>(INITIAL_COMMITS)
  const [changeStatus, setChangeStatus] = useState<'pending' | 'accepted' | 'rejected'>('pending')
  const [showSuggestModal, setShowSuggestModal] = useState(false)
  // Voice prompt tab was removed — only the text flow is supported now.
  const [suggestion, setSuggestion] = useState('')
  // Refinement status card state — floating bottom-right feedback
  const [refineStatus, setRefineStatus] = useState<{
    status: 'pending' | 'processing' | 'success' | 'error'
    summary: string
    error?: string
  } | null>(null)
  const [afterPulse, setAfterPulse] = useState(false)
  const [selectedCommit, setSelectedCommit] = useState<CommitEntry | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session } = useSession()
  const { canAutofix, isFree } = useSubscription()

  // ── Code Pipeline State ──
  const [pipelineStep, setPipelineStep] = useState<PipelineStep>(() => {
    if (typeof window === 'undefined') return 'idle'
    // UX Lab findings pending → always start fresh so they get applied.
    if (sessionStorage.getItem('refineui_ux_lab_findings')) return 'idle'
    if (sessionStorage.getItem('refineui_transform')) return 'complete'
    return 'idle'
  })
  const [pipelineError, setPipelineError] = useState('')
  const [gateError, setGateError] = useState<GateErrorData | null>(null)
  const [ingestedFiles, setIngestedFiles] = useState<FileEntry[]>([])
  const [codeAnalysis, setCodeAnalysis] = useState<CodeAnalysis | null>(null)
  const [selectedTarget, setSelectedTarget] = useState('')
  const [userIntent, setUserIntent] = useState('')
  const [transformResult, setTransformResult] = useState<TransformResult | null>(null)
  const [repoName, setRepoName] = useState<string>(() => {
    if (typeof window === 'undefined') return ''
    const stored = sessionStorage.getItem('refineui_transform')
    if (!stored) return ''
    try { return JSON.parse(stored).repoName ?? '' } catch { return '' }
  })
  const [repoBranch, setRepoBranch] = useState<string>(() => {
    if (typeof window === 'undefined') return 'main'
    const stored = sessionStorage.getItem('refineui_transform')
    if (!stored) return 'main'
    try { return JSON.parse(stored).branch || 'main' } catch { return 'main' }
  })
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [repoSearch, setRepoSearch] = useState('')
  const [publishLoading, setPublishLoading] = useState(false)
  const [publishResult, setPublishResult] = useState<{ branch_name: string; branch_url: string; files_changed: string[] } | null>(null)
  const [multiPageResult, setMultiPageResult] = useState<MultiPageTransformResult | null>(() => {
    if (typeof window === 'undefined') return null
    const stored = sessionStorage.getItem('refineui_transform')
    if (!stored) return null
    try { return JSON.parse(stored).multiPageResult ?? null } catch { return null }
  })
  const [reRendering, setReRendering] = useState(false)
  const [reRenderStatus, setReRenderStatus] = useState('')

  useEffect(() => {
    if (session?.accessToken && repos.length === 0 && pipelineStep === 'idle') {
      setLoadingRepos(true)
      fetch('https://api.github.com/user/repos?sort=updated&per_page=50&affiliation=owner,collaborator', {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      })
        .then(r => r.json())
        .then(data => { setRepos(Array.isArray(data) ? data : []); setLoadingRepos(false) })
        .catch(() => setLoadingRepos(false))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken, pipelineStep])

  const autoStartedRef = useRef(false)

  useEffect(() => {
    type PipelineWindow = Window & { __reformPipelinePromise?: Promise<unknown> }
    const bgPromise = (window as PipelineWindow).__reformPipelinePromise
    const alreadyCached = !!sessionStorage.getItem('refineui_transform')

    if (bgPromise && !alreadyCached) {
      autoStartedRef.current = true
      setPipelineStep('ingesting')
      bgPromise.then((result) => {
        const r = result as MultiPageTransformResult | null
        if (r) {
          setMultiPageResult(r)
          setRepoName(r.repo_name || '')
          setRepoBranch(r.branch || 'main')
          setPipelineStep('complete')
        } else {
          autoStartedRef.current = false
          setPipelineStep('idle')
        }
        delete (window as PipelineWindow).__reformPipelinePromise
      })
      return
    }

    delete (window as PipelineWindow).__reformPipelinePromise

    const stored = sessionStorage.getItem('refineui_analysis')
    if (stored) { try { setAnalysis(JSON.parse(stored)) } catch { /* */ } }
    const storedTransform = sessionStorage.getItem('refineui_transform')
    if (storedTransform) {
      try {
        autoStartedRef.current = true
        const t = JSON.parse(storedTransform)
        setTransform(JSON.parse(storedTransform))
        setTransformResult(t.result); setCodeAnalysis(t.codeAnalysis)
        setSelectedTarget(t.target); setRepoName(t.repoName)
        setRepoBranch(t.branch || 'main'); setPipelineStep('complete')
        // Derive multi-page result for new UI
        if (t.multiPageResult) {
          setMultiPageResult(t.multiPageResult)
        } else if (t.result) {
          setMultiPageResult(adaptLegacyResult(t.result, t.repoName || '', t.target || ''))
        }
      } catch { /* */ }
    }
  }, [])

  // Restore a past run when navigated with ?project=<id>
  const restoredProjectRef = useRef<string | null>(null)
  useEffect(() => {
    const projectId = searchParams?.get('project')
    if (!projectId || restoredProjectRef.current === projectId) return
    restoredProjectRef.current = projectId
    autoStartedRef.current = true // prevent auto-start from sessionStorage repo
    ;(async () => {
      try {
        setPipelineStep('ingesting')
        const runsRes = await fetch(apiUrl(`/projects/${projectId}/runs`))
        if (!runsRes.ok) throw new Error('runs fetch failed')
        const runs: { id: string; status: string }[] = await runsRes.json()
        const latest = runs[0]
        if (!latest) throw new Error('no runs')
        const runRes = await fetch(apiUrl(`/projects/runs/${latest.id}`))
        if (!runRes.ok) throw new Error('run fetch failed')
        const run = await runRes.json()
        const multi: MultiPageTransformResult = {
          repo_name: run.repo_name,
          branch: run.branch,
          framework: run.framework,
          total_pages_found: run.total_pages_found,
          total_evaluated: run.total_pages_found,
          total_transformed: run.total_transformed,
          total_skipped: run.total_skipped,
          global_summary: run.global_summary || [],
          pipeline_errors: run.pipeline_errors || [],
          pages: (run.pages || []).map((p: Record<string, unknown>) => ({
            page_path: p.page_path as string,
            page_name: p.page_name as string,
            route: p.route as string,
            status: (p.status as 'transformed' | 'high_quality' | 'error') || 'transformed',
            score: (p.score as number) || 0,
            original_code: p.original_code as string,
            updated_code: p.updated_code as string,
            diff_summary: p.diff_summary as string,
            change_annotations: (p.change_annotations as ChangeAnnotation[]) || [],
            change_summary: (p.change_summary as string[]) || [],
            before_screenshot: p.before_screenshot as string,
            after_screenshot: p.after_screenshot as string,
            error: p.error as string,
            retries_used: (p.retries_used as number) || 0,
          })),
        }
        setMultiPageResult(multi)
        setRepoName(run.repo_name)
        setRepoBranch(run.branch || 'main')
        setPipelineStep('complete')
      } catch (e) {
        setPipelineError(e instanceof Error ? e.message : 'Failed to load past run')
        setPipelineStep('idle')
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // Auto-start pipeline if a repo was selected anywhere (session OR local
  // storage) — picks up selections made in /new or in a previous tab so the
  // user isn't re-prompted to choose the same repo again.
  useEffect(() => {
    if (autoStartedRef.current || pipelineStep !== 'idle' || transformResult) return

    // Prefer URL params (passed by UX Lab navigation) — more reliable than storage.
    const paramRepo = searchParams?.get('repo')
    const paramBranch = searchParams?.get('branch')
    const selected = paramRepo
      ? { url: paramRepo, branch: paramBranch || 'main' }
      : getSelectedRepo()

    if (!selected?.url) return
    autoStartedRef.current = true

    // Ensure storage is up to date so other parts of the app find the selection.
    setSelectedRepo(selected.url, selected.branch)

    // Extract owner/repo from URL like https://github.com/owner/repo
    const match = selected.url.match(/github\.com\/([^/]+\/[^/]+)/)
    if (!match) return
    const fullName = match[1].replace(/\.git$/, '')

    // Create a minimal GithubRepo object and start pipeline
    runPipeline({
      id: 0, full_name: fullName, name: fullName.split('/')[1],
      private: false, language: null, updated_at: '', default_branch: selected.branch || 'main',
      homepage: null, html_url: selected.url,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineStep])

  function handleCopyCode() {
    if (!transform?.code) return
    navigator.clipboard.writeText(transform.code).then(() => {
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    })
  }

  const filteredRepos = repos.filter(r => r.full_name.toLowerCase().includes(repoSearch.toLowerCase()))

  async function runPipeline(repo: GithubRepo) {
    setPipelineError(''); setGateError(null); setRepoName(repo.full_name); setRepoBranch(repo.default_branch || 'main')
    const branch = repo.default_branch || 'main'

    // Persist the selection so the user isn't re-prompted in future tabs.
    const repoUrl = repo.html_url || `https://github.com/${repo.full_name}`
    setSelectedRepo(repoUrl, branch)

    // ── Fetch current HEAD SHA from GitHub so we can look up a cached run.
    // A run is considered valid until the next commit on this branch.
    let headSha: string | null = null
    try {
      const shaRes = await fetch(
        `https://api.github.com/repos/${repo.full_name}/commits/${branch}`,
        session?.accessToken
          ? { headers: { Authorization: `Bearer ${session.accessToken}` } }
          : undefined,
      )
      if (shaRes.ok) {
        const shaData = await shaRes.json()
        headSha = shaData?.sha || null
      }
    } catch { /* non-fatal — we'll just run fresh */ }

    // ── Try cached run for this (user, repo, branch, commit). If the DB has
    // a complete run for the same commit SHA, load it and skip the pipeline.
    if (headSha && session?.githubId) {
      try {
        const cacheRes = await fetch(
          apiUrl(`/projects/latest-run?github_user_id=${encodeURIComponent(session.githubId)}`
            + `&repo_name=${encodeURIComponent(repo.full_name)}`
            + `&branch=${encodeURIComponent(branch)}`
            + `&commit_sha=${encodeURIComponent(headSha)}`),
        )
        if (cacheRes.ok) {
          const cached = await cacheRes.json()
          // Adapt RunResponse → MultiPageTransformResult (shapes match closely).
          const adapted: MultiPageTransformResult = {
            repo_name: cached.repo_name,
            branch: cached.branch,
            framework: cached.framework,
            total_pages_found: cached.total_pages_found,
            total_evaluated: cached.total_pages_found,
            total_transformed: cached.total_transformed,
            total_skipped: cached.total_skipped,
            pages: cached.pages || [],
            global_summary: cached.global_summary || [],
            pipeline_errors: cached.pipeline_errors || [],
          }
          setMultiPageResult(adapted)
          setPipelineStep('complete')
          sessionStorage.setItem('refineui_transform', JSON.stringify({
            multiPageResult: adapted,
            repoName: repo.full_name,
            branch,
          }))
          console.info('Loaded cached transform for', repo.full_name, 'at', headSha.slice(0, 7))
          return
        }
      } catch { /* non-fatal — fall through to fresh run */ }
    }

    setPipelineStep('ingesting')
    try {
      let uxLabFindings: unknown[] | null = null
      try {
        const raw = sessionStorage.getItem('refineui_ux_lab_findings')
        if (raw) {
          uxLabFindings = JSON.parse(raw)
          sessionStorage.removeItem('refineui_ux_lab_findings')
        }
      } catch { /* ignore */ }

      // Use the v2 multi-page pipeline — one call does everything
      const res = await fetch(apiUrl('/transform-repo-v2'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          github_url: `https://github.com/${repo.full_name}`,
          branch: repo.default_branch || 'main',
          access_token: session?.accessToken || null,
          design_intelligence: analysis || null,
          user_intent: userIntent,
          max_pages: 5,
          github_user_id: session?.githubId,
          ux_lab_findings: uxLabFindings,
        }),
      })
      if (!res.ok) {
        const { gate, message } = await parseResponseError(res)
        if (gate) { setGateError(gate); setPipelineStep('idle'); return }
        throw new Error(message || 'Transform failed')
      }
      const result = await res.json()

      setMultiPageResult(result)
      setPipelineStep('complete')

      // Save for session persistence (legacy)
      sessionStorage.setItem('refineui_transform', JSON.stringify({
        multiPageResult: result,
        repoName: repo.full_name,
        branch: repo.default_branch || 'main',
      }))

      // Save to database + S3 for permanent persistence
      if (session?.githubId) {
        try {
          await fetch(apiUrl('/projects/save-run'), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              github_user_id: session.githubId,
              github_username: session.githubUsername || '',
              repo_name: repo.full_name,
              repo_url: `https://github.com/${repo.full_name}`,
              branch: repo.default_branch || 'main',
              framework: result.framework || 'unknown',
              source_commit_sha: headSha,
              user_intent: userIntent,
              design_intelligence: analysis || null,
              file_tree: [],
              files: [],
              total_pages_found: result.total_pages_found || 0,
              total_transformed: result.total_transformed || 0,
              total_skipped: result.total_skipped || 0,
              global_summary: result.global_summary || [],
              pipeline_errors: result.pipeline_errors || [],
              pages: result.pages || [],
            }),
          })
        } catch (e) {
          console.warn('Failed to save run to DB (non-fatal):', e)
        }
      }

      // Create commit entry from first transformed page
      const firstTransformed = result.pages?.find((p: { status: string }) => p.status === 'transformed')
      if (firstTransformed) {
        setSelectedTarget(firstTransformed.page_path)
        const commitLabel = firstTransformed.diff_summary?.split('.')[0]?.trim()?.slice(0, 60) || 'UI improvements'
        const newCommit: CommitEntry = { hash: Math.random().toString(16).slice(2, 8), msg: commitLabel, color: '#f59e0b', status: 'pending', code: firstTransformed.updated_code, suggestion: userIntent || 'Applied design intelligence' }
        setCommits(prev => [newCommit, ...prev])
      }
    } catch (e) { setPipelineError(e instanceof Error ? e.message : 'Transform failed'); setPipelineStep('idle') }
  }

  async function handleAccept() {
    // Collect all transformed pages with updated code
    const pages = multiPageResult?.pages.filter(p => (p.status === 'transformed' || p.status === 'weak') && p.updated_code) || []
    const hasGitHub = session?.accessToken && repoName && pages.length > 0

    if (hasGitHub) {
      setPublishLoading(true); setPipelineError('')
      try {
        const [owner, repo] = repoName.split('/')
        const res = await fetch(apiUrl('/github/publish-approved-branch'), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner, repo,
            base_branch: repoBranch || null,
            approved_files: pages.map(p => ({ path: p.page_path, content: p.updated_code })),
            transform_summary: {
              pages_transformed: pages.map(p => p.page_path),
              summary_text: multiPageResult?.global_summary?.[0] || null,
            },
            access_token: session.accessToken,
            github_user_id: session.githubId,
          }),
        })
        if (!res.ok) {
          const { gate, message } = await parseResponseError(res)
          if (gate) { setGateError(gate); setPublishLoading(false); return }
          throw new Error(message || 'Publish failed')
        }
        const data = await res.json()
        setPublishResult({ branch_name: data.branch_name, branch_url: data.branch_url, files_changed: data.files_changed })
      } catch (e) { setPipelineError(e instanceof Error ? e.message : 'Failed to publish changes'); setPublishLoading(false); return }
      setPublishLoading(false)
    }

    setChangeStatus('accepted')
    const realHash = Math.random().toString(16).slice(2, 8)
    setCommits(prev => {
      const hasPending = prev.some(c => c.status === 'pending')
      if (hasPending) return prev.map(c => c.status === 'pending' ? { ...c, status: 'accepted' as const, color: '#22c55e', hash: realHash } : c)
      const fallbackLabel = transformResult?.change_annotations[0]?.ux_impact?.split(',')[0]?.split('.')[0]?.trim() || transformResult?.transformed_files[0]?.diff_summary?.split('.')[0]?.trim()?.slice(0, 50) || 'Improve UI layout and polish'
      return [{ hash: realHash, msg: fallbackLabel, color: '#22c55e', status: 'accepted', code: transformResult?.transformed_files[0]?.updated_code } as CommitEntry, ...prev]
    })
    setScOpen(true)
  }

  function handleReject() {
    setChangeStatus('rejected')
    const hasPending = commits.some(c => c.status === 'pending')
    if (hasPending) {
      // Update ALL pending commits to rejected
      setCommits(prev => prev.map(c =>
        c.status === 'pending' ? { ...c, status: 'rejected', color: '#ef4444' } : c
      ))
    } else {
      const newCommit: CommitEntry = {
        hash: Math.random().toString(16).slice(2, 8),
        msg: 'feat: UI transformation',
        color: '#ef4444',
        status: 'rejected',
      }
      setCommits(prev => [newCommit, ...prev])
    }
    setScOpen(true)
  }

  async function handleSuggestSubmit(directPrompt?: string) {
    const promptText = (directPrompt || suggestion).trim()
    if (!promptText) return

    // Close modal and clear input immediately — never make the user wait inside a modal
    const summaryText = promptText.length > 60 ? promptText.slice(0, 57) + '...' : promptText
    setShowSuggestModal(false)
    setSuggestion('')
    setRefineStatus({ status: 'pending', summary: summaryText })

    try {
      setRefineStatus({ status: 'processing', summary: summaryText })

      const currentPage = multiPageResult?.pages.find(p => p.page_path === selectedTarget)
      const currentCode = currentPage?.updated_code || currentPage?.original_code || ''
      const res = await fetch(apiUrl('/suggest-edit'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suggestion: promptText,
          current_code: currentCode,
          analysis_context: analysis,
        }),
      })

      if (!res.ok) throw new Error('Suggest edit failed')
      const data = await res.json()

      const newCommit: CommitEntry = {
        hash: Math.random().toString(16).slice(2, 8),
        msg: `edit: ${data.summary || promptText.slice(0, 40)}`,
        color: '#f59e0b',
        status: 'pending',
        code: data.revised_code,
        suggestion: promptText,
      }
      setCommits(prev => [newCommit, ...prev])
      setChangeStatus('pending')

      // Persist the new code into the multi-page result so subsequent edits chain
      if (data.revised_code && multiPageResult && selectedTarget) {
        const updatedPages = multiPageResult.pages.map(p =>
          p.page_path === selectedTarget ? { ...p, updated_code: data.revised_code } : p
        )
        setMultiPageResult({ ...multiPageResult, pages: updatedPages })
      }

      // Re-render screenshots in the background
      if (data.revised_code && repoName && selectedTarget) {
        setReRendering(true)
        setReRenderStatus('Rendering preview...')
        try {
          const renderRes = await fetch(apiUrl('/re-render'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              repo_clone_url: `https://github.com/${repoName}.git`,
              branch: repoBranch,
              target_file: selectedTarget,
              updated_code: data.revised_code,
              access_token: session?.accessToken || '',
            }),
          })

          if (renderRes.ok) {
            const renderData = await renderRes.json()
            if (renderData.after_screenshot && multiPageResult) {
              const updatedPages = multiPageResult.pages.map(p =>
                p.page_path === selectedTarget
                  ? { ...p, after_screenshot: renderData.after_screenshot, before_screenshot: renderData.before_screenshot || p.before_screenshot }
                  : p
              )
              setMultiPageResult({ ...multiPageResult, pages: updatedPages })
            }
          }
        } catch { /* re-render is best-effort */ }
        setReRendering(false)
        setReRenderStatus('')
      }

      // Success — pulse the after panel and show success status
      setRefineStatus({ status: 'success', summary: summaryText })
      setAfterPulse(true)
      setTimeout(() => setAfterPulse(false), 2000)
      setTimeout(() => setRefineStatus(null), 4000)
    } catch (err) {
      setRefineStatus({
        status: 'error',
        summary: summaryText,
        error: err instanceof Error ? err.message : 'Something went wrong',
      })
      setTimeout(() => setRefineStatus(null), 6000)
    }
  }

  function openSuggestModal() {
    setShowSuggestModal(true)
  }

  function handleCommitClick(commit: CommitEntry) {
    setSelectedCommit(commit)
  }

  function handleAcceptRejected(commit: CommitEntry) {
    setCommits(prev =>
      prev.map(c => c.hash === commit.hash && c.msg === commit.msg ? { ...c, status: 'accepted', color: '#22c55e' } : c)
    )
    setSelectedCommit({ ...commit, status: 'accepted', color: '#22c55e' })
  }


  return (
    <div className="flex justify-center px-3 sm:px-6 py-6 sm:py-10 pb-20">
      <div className="w-full max-w-[1760px] space-y-10">

        {/* ── HEADER ── */}
        {pipelineStep === 'complete' && multiPageResult ? (
          <TransformSummaryHeader result={multiPageResult} publishResult={publishResult} />
        ) : (
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-3">UI Transformation</h1>
            <div className="flex items-center justify-center gap-3">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full" style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.15)' }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#a855f7', boxShadow: '0 0 6px rgba(168,85,247,0.4)' }} />
                <span className="text-[11px] font-medium" style={{ color: 'rgba(168,85,247,0.8)' }}>
                  {pipelineStep === 'idle' ? 'Select a Repository' : 'Processing...'}
                </span>
              </div>
              <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.25)' }}>{repoName || `${analysis?.sources?.length || 0} sources analyzed`}</span>
            </div>
          </div>
        )}

        {/* ── REPO PICKER ── */}
        {pipelineStep === 'idle' && (
          <div className="max-w-2xl mx-auto">
            <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-3 px-5 pt-5 pb-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.12)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(168,85,247,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" /></svg>
                </div>
                <div>
                  <h3 className="text-white font-semibold text-[14px]">Select a Repository</h3>
                  <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{session ? 'Choose a repo to analyze and improve' : 'Sign in with GitHub to see your repos'}</p>
                </div>
              </div>
              <div className="px-5 pb-3">
                <input type="text" value={repoSearch} onChange={e => setRepoSearch(e.target.value)} placeholder="Search repositories..." className="w-full bg-transparent px-4 py-2.5 text-[13px] outline-none rounded-lg text-white placeholder:text-white/20" style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }} />
              </div>
              <div className="px-5 pb-3">
                <input type="text" value={userIntent} onChange={e => setUserIntent(e.target.value)} placeholder="Optional: describe your goal (e.g., 'make it more modern')" className="w-full bg-transparent px-4 py-2 text-[12px] outline-none rounded-lg text-white/60 placeholder:text-white/15" style={{ border: '1px solid rgba(255,255,255,0.04)' }} />
              </div>
              <div style={{ maxHeight: '340px', overflowY: 'auto', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                {session && loadingRepos && <div className="flex items-center justify-center py-8"><div className="w-6 h-6 rounded-full animate-spin mr-3" style={{ border: '2px solid rgba(255,255,255,0.06)', borderTopColor: '#a855f7' }} /><span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Loading repos...</span></div>}
                {session && !loadingRepos && filteredRepos.map(repo => (
                  <div key={repo.id} onClick={() => runPipeline(repo)} className="flex items-center justify-between px-5 py-3 cursor-pointer transition-colors hover:bg-white/[0.04]" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <div className="flex items-center gap-3 min-w-0">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(255,255,255,0.25)"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" /></svg>
                      <div className="min-w-0"><span className="text-[13px] text-white/70 truncate block">{repo.full_name}</span><span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>{repo.language || 'Unknown'}</span></div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {repo.private && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' }}>Private</span>}
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M5.5 3.5L9 7l-3.5 3.5" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2" strokeLinecap="round" /></svg>
                    </div>
                  </div>
                ))}
                {session && !loadingRepos && filteredRepos.length === 0 && <div className="px-5 py-8 text-center"><p className="text-[13px]" style={{ color: 'rgba(255,255,255,0.25)' }}>No repositories found</p></div>}
                {!session && <div className="px-5 py-8 text-center"><p className="text-[13px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Sign in with GitHub to see your repositories</p></div>}
              </div>
            </div>
            {(gateError || pipelineError) && (
              <div className="mt-3">
                <GateErrorBanner
                  error={gateError}
                  fallbackMessage={pipelineError}
                  onDismiss={() => { setGateError(null); setPipelineError('') }}
                />
              </div>
            )}
          </div>
        )}

        {/* ── PIPELINE PROGRESS ── */}
        {(pipelineStep === 'ingesting' || pipelineStep === 'analyzing' || pipelineStep === 'transforming') && (
          <PipelineProgress step={pipelineStep} repoName={repoName} targetFile={selectedTarget} />
        )}

        {/* ── RE-RENDER PROGRESS BAR ── */}
        {reRendering && (
          <div className="max-w-xl mx-auto mb-6">
            <div className="rounded-xl p-5" style={{ background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.12)' }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-4 h-4 rounded-full animate-spin" style={{ border: '2px solid rgba(168,85,247,0.2)', borderTopColor: '#a855f7' }} />
                <span className="text-[13px] font-medium text-white">Reapplying your changes</span>
              </div>
              <div className="w-full h-1.5 rounded-full mb-2" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className="h-full rounded-full animate-pulse" style={{ width: '60%', background: 'linear-gradient(90deg, #7c3aed, #a855f7)', boxShadow: '0 0 12px rgba(168,85,247,0.3)' }} />
              </div>
              <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{reRenderStatus}</p>
            </div>
          </div>
        )}

        {/* ── MULTI-PAGE TRANSFORMATION SHOWCASE ── */}
        {pipelineStep === 'complete' && multiPageResult && (
          <div>
            <RepoWideImprovementsPanel result={multiPageResult} />
            <TransformCarousel
              pages={multiPageResult.pages}
              result={multiPageResult}
              onSelectedPathChange={setSelectedTarget}
              afterPulse={afterPulse}
            />
          </div>
        )}
        {/* ── TOOLBAR — only show when pipeline is complete ── */}
        {pipelineStep === 'complete' && <div className="rounded-xl max-w-5xl mx-auto overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 4px 24px rgba(0,0,0,0.2)' }}>
          {changeStatus === 'pending' ? (
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.12)' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(168,85,247,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
                </div>
                <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.25)' }}>Review Changes</span>
              </div>
              <div className="flex items-center gap-1.5">
                {!canAutofix ? (
                <UpgradeBanner message="Upgrade to Pro to publish fixes to GitHub" compact />
              ) : (
                <button
                  onClick={handleAccept}
                  disabled={publishLoading}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[11px] font-medium transition-all hover:bg-green-500/[0.06] active:scale-[0.97]"
                  style={{ color: 'rgba(34,197,94,0.7)', border: '1px solid transparent', opacity: publishLoading ? 0.5 : 1 }}
                >
                  {publishLoading ? (
                    <><div className="w-3 h-3 rounded-full animate-spin" style={{ border: '2px solid rgba(34,197,94,0.2)', borderTopColor: 'rgba(34,197,94,0.7)' }} />Publishing approved changes...</>
                  ) : (
                    <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>Publish to GitHub</>
                  )}
                </button>
              )}
                <button
                  onClick={handleReject}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[11px] font-medium transition-all hover:bg-red-500/[0.06] active:scale-[0.97]"
                  style={{ color: 'rgba(239,68,68,0.5)', border: '1px solid transparent' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  Keep Original
                </button>
                <div className="w-px h-5 mx-1" style={{ background: 'rgba(255,255,255,0.06)' }} />
                <button
                  onClick={openSuggestModal}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[11px] font-semibold transition-all hover:bg-purple-500/[0.06] active:scale-[0.97]"
                  style={{ color: 'rgba(168,85,247,0.7)', border: '1px solid rgba(168,85,247,0.12)' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  Refine Further
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between px-5 py-4 cursor-pointer transition-colors hover:bg-white/[0.01]" onClick={() => setChangeStatus('pending')}>
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: changeStatus === 'accepted' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${changeStatus === 'accepted' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)'}` }}>
                  {changeStatus === 'accepted' ? (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(34,197,94,0.6)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  ) : (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.5)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  )}
                </div>
                <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.2)' }}>Review Changes</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full" style={{ background: changeStatus === 'accepted' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${changeStatus === 'accepted' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)'}` }}>
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: changeStatus === 'accepted' ? '#22c55e' : '#ef4444', boxShadow: `0 0 6px ${changeStatus === 'accepted' ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}` }} />
                  <span className="text-[11px] font-medium" style={{ color: changeStatus === 'accepted' ? '#86efac' : 'rgba(239,68,68,0.7)' }}>
                    {changeStatus === 'accepted' ? 'Changes applied' : 'Original kept'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>}

        {/* ── Generated Code ── */}
        {transform?.code && (
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(124,58,237,0.2)', background: 'rgba(13,12,22,0.6)', backdropFilter: 'blur(12px)' }}>
            {/* Header row */}
            <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: codeOpen ? '1px solid rgba(124,58,237,0.15)' : 'none' }}>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full" style={{ background: '#a855f7', boxShadow: '0 0 8px rgba(168,85,247,0.5)' }} />
                <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'rgba(204,195,216,0.6)' }}>Generated Component Code</span>
                <span className="text-[9px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(124,58,237,0.15)', color: 'rgba(168,85,247,0.8)' }}>React + Tailwind</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyCode}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-medium transition-all"
                  style={{ background: codeCopied ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)', border: codeCopied ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.07)', color: codeCopied ? '#86efac' : 'rgba(204,195,216,0.5)' }}
                >
                  {codeCopied ? '✓ Copied' : 'Copy'}
                </button>
                <button
                  onClick={() => setCodeOpen(!codeOpen)}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-medium transition-all"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(204,195,216,0.5)' }}
                >
                  {codeOpen ? 'Collapse' : 'View Code'}
                </button>
              </div>
            </div>
            {/* Code block */}
            {codeOpen && (
              <div className="overflow-auto" style={{ maxHeight: '400px' }}>
                <pre className="p-5 text-[11px] leading-relaxed" style={{ color: 'rgba(204,195,216,0.75)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  <code>{transform.code}</code>
                </pre>
              </div>
            )}
          </div>
        )}

        {/* ── The Lab CTA — only when complete ── */}
        {pipelineStep === 'complete' && <div className="flex justify-center">
          <button
            onClick={() => router.push('/dashboard/edit-lab')}
            className="flex items-center gap-3 px-6 py-3 rounded-xl font-semibold text-sm text-white transition-all active:scale-[0.98]"
            style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.25)', boxShadow: '0 0 30px rgba(124,58,237,0.08)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(124,58,237,0.2)'; e.currentTarget.style.borderColor = 'rgba(124,58,237,0.4)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(124,58,237,0.12)'; e.currentTarget.style.borderColor = 'rgba(124,58,237,0.25)' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
            </svg>
            <span>Open The Lab</span>
            <span style={{ color: 'rgba(168,85,247,0.5)', fontSize: '12px' }}>→</span>
          </button>
        </div>}
      </div>

      {/* ── SOURCE CONTROL — only when complete ── */}
      {pipelineStep === 'complete' && <div className="fixed bottom-5 left-5 z-40">
        {/* Expanded panel */}
        <div
          className="overflow-hidden transition-all duration-300 ease-out rounded-2xl mb-2"
          style={{
            maxHeight: scOpen ? '380px' : '0px',
            width: '340px',
            opacity: scOpen ? 1 : 0,
            background: 'rgba(19,17,28,0.6)',
            backdropFilter: 'blur(24px) saturate(1.5)',
            WebkitBackdropFilter: 'blur(24px) saturate(1.5)',
            border: scOpen ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent',
            boxShadow: scOpen ? '0 24px 80px rgba(0,0,0,0.6), 0 0 40px rgba(124,58,237,0.08)' : 'none',
          }}
        >
          <div className="p-4 overflow-y-auto" style={{ maxHeight: '360px' }}>
            <div className="flex items-center justify-between mb-3 pb-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div className="flex items-center gap-2">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(168,85,247,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><line x1="1.05" y1="12" x2="7" y2="12" /><line x1="17.01" y1="12" x2="22.96" y2="12" /></svg>
                <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Source Control</span>
              </div>
              <span className="text-[9px] font-mono px-2 py-0.5 rounded-full" style={{ color: 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>{commits.length}</span>
            </div>
            {commits.length === 0 ? (
              <div className="text-center py-6">
                <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.15)' }}>No commits yet</span>
              </div>
            ) : (
            <div className="relative">
              <div className="absolute left-[4px] top-1 bottom-1 w-[1.5px]" style={{ background: 'linear-gradient(to bottom, rgba(168,85,247,0.4), rgba(59,130,246,0.3), rgba(239,68,68,0.3), rgba(245,158,11,0.3), rgba(168,85,247,0.1))' }} />
              {commits.map((c, i) => (
                <div
                  key={i}
                  onClick={() => handleCommitClick(c)}
                  className="flex items-center gap-2.5 py-[6px] relative cursor-pointer rounded-lg px-1.5 -mx-1 transition-all hover:bg-white/[0.03]"
                >
                  <div className="w-[9px] h-[9px] rounded-full flex-shrink-0 z-10" style={{ background: c.color, boxShadow: `0 0 8px ${c.color}40` }} />
                  <span className="text-[9px] font-mono w-11 flex-shrink-0" style={{ color: 'rgba(255,255,255,0.2)' }}>{c.hash}</span>
                  <span className="text-[10px] text-white/60 font-medium flex-1 truncate">{c.msg}</span>
                  {c.status === 'rejected' && (
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: 'rgba(239,68,68,0.1)', color: 'rgba(239,68,68,0.7)', border: '1px solid rgba(239,68,68,0.15)' }}>
                      REJECTED
                    </span>
                  )}
                  {c.status === 'pending' && (
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: 'rgba(245,158,11,0.1)', color: 'rgba(245,158,11,0.7)', border: '1px solid rgba(245,158,11,0.15)' }}>
                      PENDING
                    </span>
                  )}
                </div>
              ))}
            </div>
            )}
          </div>
        </div>

        {/* Toggle pill */}
        <button
          onClick={() => setScOpen(!scOpen)}
          className="flex items-center gap-2 px-4 py-2 rounded-full transition-all active:scale-95"
          style={{
            background: 'rgba(19,17,28,0.6)',
            backdropFilter: 'blur(20px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 20px rgba(124,58,237,0.06)',
          }}
        >
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: scOpen ? '#22c55e' : '#a855f7', boxShadow: scOpen ? '0 0 6px rgba(34,197,94,0.4)' : '0 0 6px rgba(168,85,247,0.3)' }} />
          <span className="text-[10px] font-medium" style={{ color: 'rgba(255,255,255,0.45)' }}>Source Control</span>
          <span className="text-[8px] transition-transform duration-300" style={{ color: 'rgba(255,255,255,0.2)', transform: scOpen ? 'rotate(180deg)' : '' }}>&#9650;</span>
        </button>
      </div>}

      {/* ── SUGGEST EDIT MODAL ── */}
      {showSuggestModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(12px)' }}>
          <div className="rounded-2xl w-full max-w-3xl mx-4 overflow-hidden animate-in fade-in zoom-in duration-200" style={{ background: 'linear-gradient(180deg, rgba(30,27,46,1) 0%, rgba(19,17,28,1) 100%)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 60px rgba(124,58,237,0.1)' }}>
            {/* Accent top bar */}
            <div className="h-[2px]" style={{ background: 'linear-gradient(90deg, #7c3aed, #a855f7, rgba(168,85,247,0.2), transparent)' }} />

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.15)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                </div>
                <div>
                  <h2 className="text-white font-semibold text-[15px]">Suggest an Edit</h2>
                  <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>Describe the change you&apos;d like Reform to apply</p>
                </div>
              </div>
              <button onClick={() => setShowSuggestModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/[0.05]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            {/* Text Prompt (voice prompt removed) */}
            <div className="px-6 pt-5 pb-6">
              <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="p-5">
                  <textarea
                    autoFocus
                    value={suggestion}
                    onChange={e => setSuggestion(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleSuggestSubmit() }}
                    placeholder="Describe what you'd like to change... (e.g., 'Make the sidebar collapsible', 'Change the accent color to blue')"
                    className="w-full bg-transparent text-[13px] text-white outline-none resize-none placeholder:text-white/20"
                    style={{ minHeight: '140px', lineHeight: '1.7' }}
                  />
                  <div className="flex items-center justify-between mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className="text-[10px] flex items-center gap-1.5" style={{ color: 'rgba(255,255,255,0.15)' }}>
                      <kbd className="px-1.5 py-0.5 rounded text-[9px] font-mono" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>&#8984;</kbd>
                      <span>+</span>
                      <kbd className="px-1.5 py-0.5 rounded text-[9px] font-mono" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>Enter</kbd>
                      <span className="ml-1">to submit</span>
                    </span>
                    <button
                      onClick={() => handleSuggestSubmit()}
                      disabled={!suggestion.trim()}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[11px] font-semibold transition-all active:scale-[0.97]"
                      style={{
                        background: suggestion.trim() ? 'linear-gradient(135deg, #7c3aed, #6d28d9)' : 'rgba(255,255,255,0.04)',
                        color: suggestion.trim() ? 'white' : 'rgba(255,255,255,0.2)',
                        boxShadow: suggestion.trim() ? '0 0 25px rgba(124,58,237,0.25)' : 'none',
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                      Send to AI
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── COMMIT DETAIL MODAL ── */}
      {selectedCommit && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(12px)' }}>
          <div className="rounded-2xl max-w-lg w-full mx-4 overflow-hidden animate-in fade-in zoom-in duration-200" style={{ background: 'linear-gradient(180deg, rgba(30,27,46,1) 0%, rgba(19,17,28,1) 100%)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: `0 24px 80px rgba(0,0,0,0.6), 0 0 40px ${selectedCommit.color}12` }}>
            {/* Accent top bar */}
            <div className="h-[2px]" style={{ background: `linear-gradient(90deg, ${selectedCommit.color}80, ${selectedCommit.color}20, transparent)` }} />

            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${selectedCommit.color}15`, border: `1px solid ${selectedCommit.color}25` }}>
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: selectedCommit.color, boxShadow: `0 0 10px ${selectedCommit.color}50` }} />
                </div>
                <div>
                  <span className="text-[11px] font-mono block" style={{ color: 'rgba(255,255,255,0.3)' }}>{selectedCommit.hash}</span>
                  {selectedCommit.status === 'rejected' && (
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#ef4444' }}>Rejected</span>
                  )}
                  {selectedCommit.status === 'accepted' && (
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#86efac' }}>Accepted</span>
                  )}
                  {selectedCommit.status === 'pending' && (
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#f59e0b' }}>Pending Review</span>
                  )}
                </div>
              </div>
              <button onClick={() => setSelectedCommit(null)} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/[0.05]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Commit message */}
              <div>
                <span className="text-[9px] font-medium uppercase tracking-wider block mb-1.5" style={{ color: 'rgba(255,255,255,0.2)' }}>Commit Message</span>
                <h3 className="text-white font-semibold text-[15px] leading-snug">{selectedCommit.msg}</h3>
              </div>

              {/* Suggestion text if available */}
              {selectedCommit.suggestion && (
                <div className="rounded-xl p-4" style={{ background: 'rgba(168,85,247,0.03)', border: '1px solid rgba(168,85,247,0.08)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(168,85,247,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    <span className="text-[9px] font-medium uppercase tracking-wider" style={{ color: 'rgba(168,85,247,0.5)' }}>Suggested Edit</span>
                  </div>
                  <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>{selectedCommit.suggestion}</p>
                </div>
              )}

              {/* Code preview if available */}
              {selectedCommit.code && (
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="px-4 py-2 flex items-center justify-between" style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span className="text-[9px] font-medium uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.2)' }}>Code Preview</span>
                    <span className="text-[9px] font-mono px-2 py-0.5 rounded" style={{ background: 'rgba(168,85,247,0.08)', color: 'rgba(168,85,247,0.5)' }}>
                      {selectedCommit.code.split('\n').length} lines
                    </span>
                  </div>
                  <pre className="p-4 text-[11px] font-mono overflow-x-auto leading-relaxed" style={{ background: 'rgba(0,0,0,0.25)', color: 'rgba(255,255,255,0.45)', maxHeight: '200px' }}>
                    {selectedCommit.code.slice(0, 500)}{selectedCommit.code.length > 500 ? '\n...' : ''}
                  </pre>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 px-6 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)' }}>
              {(selectedCommit.status === 'rejected' || selectedCommit.status === 'pending') && (
                <button
                  onClick={() => handleAcceptRejected(selectedCommit)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[11px] font-semibold transition-all active:scale-[0.97]"
                  style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.08))', color: '#86efac', border: '1px solid rgba(34,197,94,0.2)', boxShadow: '0 0 20px rgba(34,197,94,0.08)' }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  Accept{selectedCommit.status === 'rejected' ? ' Now' : ' Changes'}
                </button>
              )}
              <button
                onClick={() => setSelectedCommit(null)}
                className="px-5 py-2.5 rounded-xl text-[11px] font-medium transition-colors hover:bg-white/[0.03]"
                style={{ color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── REFINEMENT STATUS CARD — floating bottom-right ── */}
      {refineStatus && (
        <div
          className="fixed bottom-6 right-6 z-[250] animate-in slide-in-from-bottom-4 fade-in duration-300"
          style={{ maxWidth: '320px', width: '100%' }}
        >
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, rgba(30,27,46,0.98) 0%, rgba(19,17,28,0.98) 100%)',
              border: `1px solid ${
                refineStatus.status === 'success' ? 'rgba(34,197,94,0.2)'
                : refineStatus.status === 'error' ? 'rgba(239,68,68,0.2)'
                : 'rgba(168,85,247,0.2)'
              }`,
              boxShadow: '0 8px 40px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.1)',
              backdropFilter: 'blur(20px)',
            }}
          >
            {/* Accent top line */}
            <div className="h-[2px]" style={{
              background: refineStatus.status === 'success'
                ? 'linear-gradient(90deg, #22c55e, rgba(34,197,94,0.2), transparent)'
                : refineStatus.status === 'error'
                ? 'linear-gradient(90deg, #ef4444, rgba(239,68,68,0.2), transparent)'
                : 'linear-gradient(90deg, #a855f7, rgba(168,85,247,0.2), transparent)',
            }} />

            <div className="flex items-start gap-3 px-4 py-3.5">
              {/* Status icon */}
              <div className="flex-shrink-0 mt-0.5">
                {refineStatus.status === 'pending' && (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'rgba(168,85,247,0.1)' }}>
                    <div className="w-2 h-2 rounded-full" style={{ background: '#a855f7', boxShadow: '0 0 6px rgba(168,85,247,0.5)' }} />
                  </div>
                )}
                {refineStatus.status === 'processing' && (
                  <div className="w-5 h-5 rounded-full animate-spin" style={{ border: '2px solid rgba(168,85,247,0.15)', borderTopColor: '#a855f7' }} />
                )}
                {refineStatus.status === 'success' && (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.1)' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  </div>
                )}
                {refineStatus.status === 'error' && (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)' }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-white leading-tight">
                  {refineStatus.status === 'pending' && 'Change pending'}
                  {refineStatus.status === 'processing' && 'Applying changes'}
                  {refineStatus.status === 'success' && 'Changes applied'}
                  {refineStatus.status === 'error' && 'Change failed'}
                </p>
                <p className="text-[11px] mt-0.5 truncate" style={{
                  color: refineStatus.status === 'error'
                    ? 'rgba(252,165,165,0.7)'
                    : refineStatus.status === 'success'
                    ? 'rgba(134,239,172,0.7)'
                    : 'rgba(255,255,255,0.4)',
                }}>
                  {refineStatus.status === 'error'
                    ? (refineStatus.error || 'Something went wrong')
                    : refineStatus.status === 'success'
                    ? 'Your updated UI is ready'
                    : refineStatus.status === 'processing'
                    ? 'Refining the selected page...'
                    : refineStatus.summary
                  }
                </p>
              </div>

              {/* Dismiss */}
              <button
                onClick={() => setRefineStatus(null)}
                className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-white/[0.05]"
                style={{ color: 'rgba(255,255,255,0.25)' }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
