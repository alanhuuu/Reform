'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { apiUrl } from '@/lib/api'
import { setSelectedRepo } from '@/lib/selectedRepo'
import { Button, PageHeader, Spinner, StatusDot } from '@/components/ui'
import CheckoutResult from '@/components/dashboard/CheckoutResult'

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
  const branch = searchParams.get('branch')
  const { data: session } = useSession()
  const [projects, setProjects] = useState<ProjectData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (repo) {
      setSelectedRepo(repo, branch || 'main')
      const qs = new URLSearchParams({ repo })
      if (branch) qs.set('branch', branch)
      router.replace(`/dashboard/discovery?${qs.toString()}`)
    }
  }, [repo, branch, router])

  useEffect(() => {
    if (!session?.githubId || repo) return
    setLoading(true)
    fetch(apiUrl(`/projects?github_user_id=${session.githubId}`))
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setProjects(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [session?.githubId, repo])

  if (repo) return null

  return (
    <div className="max-w-[1120px] mx-auto px-6 py-8">
      <CheckoutResult />

      <PageHeader
        kicker="WORKSPACE"
        title="Projects"
        description="Every transformation run you've kicked off. Click one to resume or inspect the result."
        actions={
          <Button
            onClick={() => router.push('/dashboard/discovery')}
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            }
          >
            New analysis
          </Button>
        }
      />

      <div className="mt-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size={16} />
          </div>
        ) : projects.length === 0 ? (
          <EmptyState onStart={() => router.push('/dashboard/discovery')} />
        ) : (
          <ProjectsTable
            projects={projects}
            onOpen={(p) => router.push(`/dashboard/transform?project=${p.id}`)}
          />
        )}
      </div>
    </div>
  )
}

function ProjectsTable({
  projects,
  onOpen,
}: {
  projects: ProjectData[]
  onOpen: (p: ProjectData) => void
}) {
  return (
    <div
      className="rounded-[12px] overflow-hidden"
      style={{ background: '#161616', border: '1px solid #262626' }}
    >
      {/* Header row */}
      <div
        className="grid grid-cols-[minmax(0,1fr)_100px_80px_110px] items-center gap-4 px-4 h-9 text-[10px] font-medium uppercase tracking-[0.08em]"
        style={{ color: '#6B7280', borderBottom: '1px solid #1F1F1F', background: '#111111' }}
      >
        <div>Repository</div>
        <div>Status</div>
        <div>Runs</div>
        <div className="text-right">Updated</div>
      </div>

      {projects.map((p, i) => {
        const isComplete = p.latest_run_status === 'complete'
        const isRunning = p.latest_run_status === 'running'
        const statusKind = isComplete ? 'live' : isRunning ? 'accent' : 'idle'
        const statusText = isComplete ? 'Complete' : isRunning ? 'Running' : 'Draft'
        return (
          <button
            key={p.id}
            onClick={() => onOpen(p)}
            className="w-full grid grid-cols-[minmax(0,1fr)_100px_80px_110px] items-center gap-4 px-4 h-[52px] text-left transition-colors duration-150"
            style={{
              background: 'transparent',
              borderBottom: i === projects.length - 1 ? 'none' : '1px solid #1F1F1F',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#191919')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-7 h-7 rounded-[6px] flex-shrink-0 flex items-center justify-center"
                style={{
                  background: '#1A1A1A',
                  border: '1px solid #262626',
                }}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#9CA3AF"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                </svg>
              </div>
              <div className="min-w-0">
                <div
                  className="text-[13px] font-medium truncate"
                  style={{ color: '#E5E7EB', letterSpacing: '-0.005em' }}
                >
                  {p.repo_name.split('/')[1]}
                </div>
                <div
                  className="text-[11px] truncate"
                  style={{
                    color: '#6B7280',
                    fontFamily: 'var(--font-mono), monospace',
                  }}
                >
                  {p.repo_name} · {p.branch}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <StatusDot kind={statusKind} pulse={isRunning} size={5} />
              <span className="text-[11.5px]" style={{ color: '#9CA3AF' }}>
                {statusText}
              </span>
            </div>
            <div
              className="text-[12px]"
              style={{ color: '#9CA3AF', fontFamily: 'var(--font-mono), monospace' }}
            >
              {p.total_runs}
            </div>
            <div
              className="text-[11.5px] text-right"
              style={{ color: '#6B7280' }}
            >
              {new Date(p.updated_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div
      className="rounded-[12px] border border-dashed flex flex-col items-center justify-center py-14 text-center"
      style={{ background: '#111111', borderColor: '#262626' }}
    >
      <div
        className="w-10 h-10 rounded-[10px] flex items-center justify-center mb-4"
        style={{
          background: 'rgba(16,185,129,0.08)',
          border: '1px solid rgba(16,185,129,0.2)',
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#10B981"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      </div>
      <h2
        className="text-[15px] font-semibold mb-1"
        style={{ color: '#E5E7EB', letterSpacing: '-0.01em' }}
      >
        No projects yet
      </h2>
      <p className="text-[12.5px] mb-5 max-w-[340px]" style={{ color: '#9CA3AF' }}>
        Connect a repo to run your first transformation.
      </p>
      <Button onClick={onStart}>Get started</Button>
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
