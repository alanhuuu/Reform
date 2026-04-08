'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
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

export default function ProjectsDrawer() {
  const { data: session } = useSession()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [projects, setProjects] = useState<ProjectData[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !session?.githubId) return
    setLoading(true)
    fetch(apiUrl(`/projects?github_user_id=${session.githubId}`))
      .then(r => (r.ok ? r.json() : []))
      .then(data => setProjects(Array.isArray(data) ? data : []))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false))
  }, [open, session?.githubId])

  // Close on Esc
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const initial = (session?.user?.name || session?.githubUsername || '?').charAt(0).toUpperCase()
  const avatarUrl = session?.user?.image

  function openProject(project: ProjectData) {
    setOpen(false)
    router.push(`/dashboard/transform?project=${project.id}`)
  }

  return (
    <>
      {/* Profile trigger */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Open projects"
        className="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden transition-all hover:scale-[1.05]"
        style={{
          background: 'linear-gradient(135deg, rgba(124,140,255,0.25), rgba(124,140,255,0.1))',
          border: '1px solid rgba(170,180,255,0.25)',
          boxShadow: '0 0 20px rgba(124,140,255,0.15)',
        }}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-[13px] font-semibold text-white">{initial}</span>
        )}
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-[90] transition-opacity"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer */}
      <aside
        className="fixed top-0 left-0 bottom-0 z-[95] w-[360px] max-w-[90vw] flex flex-col transition-transform duration-300"
        style={{
          background: 'linear-gradient(180deg, rgba(14,16,24,0.98) 0%, rgba(8,10,16,0.98) 100%)',
          borderRight: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '24px 0 80px rgba(0,0,0,0.6)',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
        }}
      >
        {/* Header */}
        <div className="px-5 py-5 border-b flex items-center gap-3" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(124,140,255,0.25), rgba(124,140,255,0.1))',
              border: '1px solid rgba(170,180,255,0.25)',
            }}
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-[14px] font-semibold text-white">{initial}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-white truncate">
              {session?.user?.name || session?.githubUsername || 'Signed in'}
            </div>
            {session?.githubUsername && (
              <div className="text-[11px] font-mono truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>
                @{session.githubUsername}
              </div>
            )}
          </div>
          <button
            onClick={() => setOpen(false)}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/5"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* My Projects section */}
        <div className="px-5 pt-5 pb-2 flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: 'rgba(255,255,255,0.4)' }}>
            My Projects
          </div>
          <div className="text-[10px] font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>
            {projects.length}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-4 h-4 rounded-full animate-spin" style={{ border: '2px solid rgba(168,85,247,0.2)', borderTopColor: '#a855f7' }} />
            </div>
          ) : !session?.githubId ? (
            <div className="px-2 py-10 text-center text-[12px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Sign in to view your projects.
            </div>
          ) : projects.length === 0 ? (
            <div className="px-2 py-10 text-center text-[12px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
              No past transformations yet.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {projects.map(project => {
                const repoShort = project.repo_name.split('/')[1] || project.repo_name
                const status = project.latest_run_status
                return (
                  <li key={project.id}>
                    <button
                      onClick={() => openProject(project)}
                      className="w-full text-left rounded-xl px-3 py-3 transition-all hover:bg-white/[0.04]"
                      style={{
                        background: 'rgba(255,255,255,0.015)',
                        border: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="text-[13px] font-semibold text-white truncate">{repoShort}</div>
                        {status === 'complete' ? (
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#22c55e', boxShadow: '0 0 6px rgba(34,197,94,0.5)' }} />
                        ) : status === 'running' ? (
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 animate-pulse" style={{ background: '#a855f7' }} />
                        ) : status === 'failed' ? (
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#ef4444' }} />
                        ) : null}
                      </div>
                      <div className="text-[10px] font-mono truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        {project.repo_name}
                      </div>
                      <div className="flex items-center gap-2 mt-2 text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        <span>{project.total_runs} {project.total_runs === 1 ? 'run' : 'runs'}</span>
                        <span>•</span>
                        <span>{new Date(project.updated_at).toLocaleDateString()}</span>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        {session && (
          <div className="px-5 py-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="w-full text-left text-[12px] font-medium px-3 py-2 rounded-lg hover:bg-white/5"
              style={{ color: 'rgba(255,255,255,0.5)' }}
            >
              Sign out
            </button>
          </div>
        )}
      </aside>
    </>
  )
}
