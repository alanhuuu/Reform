'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { apiUrl } from '@/lib/api'
import { setSelectedRepo } from '@/lib/selectedRepo'
import { Button, Card, PageHeader, Spinner, StatusDot } from '@/components/ui'
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
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-12 sm:py-16">
      <CheckoutResult />

      <div className="flex items-start justify-between gap-6 mb-12">
        <PageHeader
          kicker="WORKSPACE"
          title="Your projects"
          description="Every transformation you've run, saved and replayable."
        />
        <Button
          onClick={() => router.push('/dashboard/discovery')}
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          }
          className="flex-shrink-0"
        >
          New analysis
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Spinner size={20} />
        </div>
      ) : projects.length === 0 ? (
        <EmptyState onStart={() => router.push('/dashboard/discovery')} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => router.push(`/dashboard/transform?project=${project.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ProjectCard({ project, onClick }: { project: ProjectData; onClick: () => void }) {
  const statusColor =
    project.latest_run_status === 'complete'
      ? 'live'
      : project.latest_run_status === 'running'
        ? 'accent'
        : 'idle'
  const statusLabel =
    project.latest_run_status === 'complete'
      ? 'Complete'
      : project.latest_run_status === 'running'
        ? 'Running'
        : 'Draft'

  return (
    <Card hoverable padded={false} onClick={onClick} className="overflow-hidden">
      <div className="p-5 flex flex-col gap-4 h-full">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(255,255,255,0.55)"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="text-[14px] font-semibold text-white truncate"
              style={{ letterSpacing: '-0.015em' }}
            >
              {project.repo_name.split('/')[1]}
            </div>
            <div
              className="text-[11px] truncate"
              style={{ color: '#6B7280', fontFamily: 'var(--font-mono), monospace' }}
            >
              {project.repo_name}
            </div>
          </div>
        </div>

        <div
          className="h-px w-full"
          style={{ background: 'rgba(255,255,255,0.05)' }}
        />

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <StatusDot kind={statusColor} pulse={statusColor === 'accent'} />
            <span className="text-[11px]" style={{ color: '#A1A1AA' }}>
              {statusLabel}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px]" style={{ color: '#6B7280' }}>
            <span>
              {project.total_runs} run{project.total_runs !== 1 ? 's' : ''}
            </span>
            <span style={{ fontFamily: 'var(--font-mono), monospace' }}>{project.branch}</span>
            <span>
              {new Date(project.updated_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </div>
        </div>
      </div>
    </Card>
  )
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
        style={{
          background: 'rgba(16,185,129,0.06)',
          border: '1px solid rgba(16,185,129,0.2)',
        }}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#10B981"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      </div>
      <h2
        className="text-[20px] font-semibold text-white mb-2"
        style={{ letterSpacing: '-0.02em' }}
      >
        No projects yet
      </h2>
      <p className="text-[13px] mb-6 max-w-[360px]" style={{ color: '#A1A1AA' }}>
        Run your first transformation — connect a repo and watch Reform analyze, rebuild, and
        render your UI in under two minutes.
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
