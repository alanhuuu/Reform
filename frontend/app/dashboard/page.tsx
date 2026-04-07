'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { apiUrl } from '@/lib/api'

interface ProjectData {
  id: string
  repo_name: string
  repo_url: string
  branch: string
  created_at: string
  updated_at: string
  latest_run_status: string | null
  total_runs: number
}

function DashboardContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const repo = searchParams.get('repo')
  const { data: session } = useSession()
  const [projects, setProjects] = useState<ProjectData[]>([])
  const [loading, setLoading] = useState(true)

  // If a repo param is present, redirect to discovery flow
  useEffect(() => {
    if (repo) {
      router.replace(`/dashboard/discovery?repo=${encodeURIComponent(repo)}`)
    }
  }, [repo, router])

  // Load user's projects
  useEffect(() => {
    if (!session?.githubId || repo) return
    setLoading(true)
    fetch(apiUrl(`/projects?github_user_id=${session.githubId}`))
      .then(r => r.ok ? r.json() : [])
      .then(data => { setProjects(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [session?.githubId, repo])

  if (repo) return null

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Your Projects</h1>
          <p className="text-[13px] mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Past transformations and results
          </p>
        </div>
        <button
          onClick={() => router.push('/dashboard/discovery')}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.98]"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', boxShadow: '0 0 30px rgba(124,58,237,0.2)' }}
        >
          New Analysis
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 rounded-full animate-spin" style={{ border: '2px solid rgba(168,85,247,0.2)', borderTopColor: '#a855f7' }} />
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.15)' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(168,85,247,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-white mb-2">No projects yet</h2>
          <p className="text-[13px] mb-6" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Run your first transformation to see it here
          </p>
          <button
            onClick={() => router.push('/dashboard/discovery')}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}
          >
            Get Started
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(project => (
            <div
              key={project.id}
              onClick={() => router.push(`/dashboard/transform?project=${project.id}`)}
              className="rounded-xl p-5 cursor-pointer transition-all hover:scale-[1.02]"
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
              }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.15)' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(168,85,247,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-white truncate">{project.repo_name.split('/')[1]}</p>
                  <p className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.2)' }}>{project.repo_name}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-3">
                {project.latest_run_status === 'complete' ? (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.12)' }}>
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#22c55e' }} />
                    <span className="text-[10px] font-medium" style={{ color: '#86efac' }}>Complete</span>
                  </div>
                ) : project.latest_run_status === 'running' ? (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full" style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.12)' }}>
                    <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#a855f7' }} />
                    <span className="text-[10px] font-medium" style={{ color: 'rgba(168,85,247,0.7)' }}>Running</span>
                  </div>
                ) : null}
                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.15)' }}>{project.total_runs} run{project.total_runs !== 1 ? 's' : ''}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.15)' }}>
                  {new Date(project.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <span className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.1)' }}>{project.branch}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function DashboardIndex() {
  return (
    <Suspense fallback={null}>
      <DashboardContent />
    </Suspense>
  )
}
