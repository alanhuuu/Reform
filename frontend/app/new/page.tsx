'use client'

import { useState, useEffect } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'
import InteractiveBackground from '@/components/landing/InteractiveBackground'

const STEPS = [
  { num: '01', text: 'Connect or paste a repo URL' },
  { num: '02', text: 'Analyze competitors and design cues' },
  { num: '03', text: 'Generate a refined frontend direction' },
]

const PROCESS_NOTES = [
  'Reform scans the repo structure before making visual recommendations.',
  'Competitor analysis is used to shape the aesthetic direction, not your product logic.',
  'The workflow stays frontend-only, so routes, handlers, and backend flow remain untouched.',
]

interface GithubRepo {
  id: number
  full_name: string
  name: string
  private: boolean
  language: string | null
  updated_at: string
  default_branch: string
}

function GitHubIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  )
}

export default function NewPage() {
  const { data: session, status } = useSession()
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'main' | 'github' | 'creating'>('main')
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [creatingRepo, setCreatingRepo] = useState(false)
  const [createdRepo, setCreatedRepo] = useState<string | null>(null)
  const [newRepoName, setNewRepoName] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)

  useEffect(() => {
    if (view === 'github' && session?.accessToken && repos.length === 0) {
      setLoadingRepos(true)
      fetch('https://api.github.com/user/repos?sort=updated&per_page=20', {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      })
        .then((r) => r.json())
        .then((data) => {
          setRepos(Array.isArray(data) ? data : [])
          setLoadingRepos(false)
        })
        .catch(() => setLoadingRepos(false))
    }
  }, [view, session, repos.length])

  async function handleCreateRepo() {
    if (!session?.accessToken || !newRepoName.trim()) return
    setCreatingRepo(true)
    const name = `reform-${newRepoName.trim().toLowerCase().replace(/\s+/g, '-')}`
    const res = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        description: 'Refactored with Reform — polished frontend, same logic.',
        private: false,
        auto_init: true,
      }),
    })
    const data = await res.json()
    setCreatingRepo(false)
    if (data.html_url) {
      setCreatedRepo(data.html_url)
    }
  }

  const filteredRepos = repos.filter((r) =>
    r.full_name.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div className="app-shell min-h-screen">
      <InteractiveBackground />
      <div className="relative z-[1] min-h-screen flex flex-col">
        {/* Header */}
        <header
          className="border-b backdrop-blur-2xl"
          style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(5,7,12,0.76)' }}
        >
          <div className="max-w-5xl mx-auto px-5 sm:px-6 py-4 flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center overflow-hidden"
                style={{
                  background: 'linear-gradient(180deg, rgba(124,140,255,0.2) 0%, rgba(124,140,255,0.08) 100%)',
                  border: '1px solid rgba(170,180,255,0.16)',
                }}
              >
                <Image src="/reform_justlogo.png" alt="Reform" width={34} height={34} className="object-contain" />
              </div>
              <span className="text-[16px] font-semibold text-white" style={{ letterSpacing: '-0.03em' }}>Reform</span>
            </Link>

            {status === 'loading' ? null : session ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-2.5 px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  {session.user?.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={session.user.image} alt="" className="w-6 h-6 rounded-full" />
                  )}
                  <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    {session.user?.name ?? session.user?.email}
                  </span>
                </div>
                <button onClick={() => signOut()} className="btn-ghost text-xs px-3.5 py-2 rounded-xl">
                  Sign out
                </button>
              </div>
            ) : (
              <button
                onClick={() => signIn('github')}
                className="btn-ghost inline-flex items-center gap-2 text-sm px-4 py-2 rounded-xl font-medium"
              >
                <GitHubIcon size={14} />
                Sign in with GitHub
              </button>
            )}
          </div>
        </header>

        {/* Main content — single centered column */}
        <div className="flex-1">
          <div className="max-w-2xl mx-auto px-5 sm:px-6">

            {/* Hero */}
            <div className="pt-20 sm:pt-28 lg:pt-36 pb-16 sm:pb-20">
              <div className="mono text-[11px] mb-5" style={{ color: 'rgba(255,255,255,0.3)' }}>New project</div>
              <h1
                className="text-[clamp(32px,5vw,48px)] font-bold text-white leading-[1.15]"
                style={{ letterSpacing: '-0.04em' }}
              >
                Start from the repo.
                <br />
                <span style={{ color: 'rgba(255,255,255,0.4)' }}>Keep the product intact.</span>
              </h1>
              <p
                className="mt-5 max-w-md text-[15px]"
                style={{ color: 'rgba(255,255,255,0.45)', lineHeight: 1.7 }}
              >
                Connect a GitHub repository or create a new one. Reform uses it as the starting point for a frontend-only polish pass.
              </p>
            </div>

            {/* Primary action area */}
            {view === 'github' ? (
              /* ── GitHub repo selection view ── */
              <div className="pb-20">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold text-white" style={{ letterSpacing: '-0.02em' }}>
                    Choose a repository
                  </h2>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="mono text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      {session ? 'Connected' : 'Public repos'}
                    </span>
                  </div>
                </div>

                <div
                  className="flex items-center gap-3 rounded-xl px-4 py-3 mb-4"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <GitHubIcon size={15} color="rgba(255,255,255,0.35)" />
                  <input
                    autoFocus
                    type="text"
                    placeholder={session ? 'Search your repositories...' : 'github.com/owner/repository'}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full bg-transparent text-sm outline-none"
                    style={{ color: 'rgba(255,255,255,0.82)' }}
                  />
                </div>

                <div
                  className="rounded-xl overflow-hidden"
                  style={{ border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    {!session && (
                      <div className="p-5 space-y-4">
                        <button
                          onClick={() => signIn('github')}
                          className="btn-ghost w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium"
                        >
                          <GitHubIcon size={14} />
                          Sign in to browse your repos
                        </button>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                          <span className="mono text-[10px]" style={{ color: 'rgba(255,255,255,0.24)' }}>or</span>
                          <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                        </div>
                        <Link
                          href={`/dashboard?repo=${encodeURIComponent(query || 'https://github.com/vercel/next.js')}`}
                          className="btn-primary w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold"
                        >
                          Analyze this repo
                          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                            <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </Link>
                      </div>
                    )}

                    {session && loadingRepos && (
                      <div className="flex items-center justify-center py-12 text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        Loading your repositories...
                      </div>
                    )}

                    {session && !loadingRepos && filteredRepos.map((repo) => (
                      <Link
                        key={repo.id}
                        href={`/dashboard?repo=${encodeURIComponent(`https://github.com/${repo.full_name}`)}&branch=${encodeURIComponent(repo.default_branch || 'main')}`}
                        className="flex items-center justify-between gap-4 px-4 py-3.5 transition-colors hover:bg-white/[0.03]"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <GitHubIcon size={15} color="rgba(255,255,255,0.35)" />
                          <div className="min-w-0">
                            <span className="text-sm text-white truncate block">{repo.full_name}</span>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                              {repo.language && <span>{repo.language}</span>}
                              {repo.private && <span>Private</span>}
                            </div>
                          </div>
                        </div>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0">
                          <path d="M5 3.5L8.5 7 5 10.5" stroke="rgba(255,255,255,0.2)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </Link>
                    ))}

                    {session && !loadingRepos && (
                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        {!showCreateForm ? (
                          <button
                            onClick={() => setShowCreateForm(true)}
                            className="w-full flex items-center gap-3 px-4 py-3.5 transition-colors text-left hover:bg-white/[0.03]"
                          >
                            <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '15px' }}>+</span>
                            <div>
                              <div className="text-sm text-white">Create new repo</div>
                              <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>New Reform-ready repository</div>
                            </div>
                          </button>
                        ) : createdRepo ? (
                          <div className="px-4 py-4 text-center">
                            <div className="inline-flex items-center gap-2 mb-2 px-3 py-1.5 rounded-full" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.16)' }}>
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                <circle cx="8" cy="8" r="7" stroke="#34d399" strokeWidth="1.5"/>
                                <path d="M5 8l2.5 2.5L11 5.5" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              <span className="text-[12px]" style={{ color: '#7dd3a8' }}>Created</span>
                            </div>
                            <a href={createdRepo} target="_blank" rel="noopener noreferrer" className="block text-sm underline" style={{ color: 'rgba(255,255,255,0.45)' }}>
                              {createdRepo}
                            </a>
                          </div>
                        ) : (
                          <div className="px-4 py-3.5 flex items-center gap-3">
                            <span className="mono text-[12px]" style={{ color: 'rgba(255,255,255,0.28)', whiteSpace: 'nowrap' }}>
                              reform-
                            </span>
                            <input
                              autoFocus
                              type="text"
                              placeholder="my-project"
                              value={newRepoName}
                              onChange={(e) => setNewRepoName(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleCreateRepo()}
                              className="flex-1 bg-transparent outline-none text-sm rounded-none border-b pb-1.5"
                              style={{ color: 'rgba(255,255,255,0.84)', borderColor: 'rgba(255,255,255,0.12)' }}
                            />
                            <button
                              onClick={handleCreateRepo}
                              disabled={!newRepoName.trim() || creatingRepo}
                              className="btn-primary px-3 py-1.5 rounded-lg text-xs font-semibold"
                              style={{ opacity: creatingRepo ? 0.6 : 1 }}
                            >
                              {creatingRepo ? 'Creating...' : 'Create'}
                            </button>
                            <button
                              onClick={() => setShowCreateForm(false)}
                              style={{ color: 'rgba(255,255,255,0.28)', fontSize: '18px', lineHeight: 1 }}
                            >
                              &times;
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <button onClick={() => { setView('main'); setQuery('') }} className="link-muted mt-6 text-xs">
                  &larr; Back
                </button>
              </div>
            ) : (
              /* ── Main view ── */
              <div className="pb-20">
                {/* Action rows */}
                <div className="space-y-2">
                  <button
                    className="w-full flex items-center justify-between gap-4 rounded-xl px-4 py-3.5 transition-colors hover:bg-white/[0.03] text-left"
                    style={{ border: '1px solid rgba(255,255,255,0.07)' }}
                    onClick={() => setView('github')}
                  >
                    <div className="flex items-center gap-3">
                      <GitHubIcon size={16} color="rgba(255,255,255,0.45)" />
                      <div>
                        <div className="text-sm font-medium text-white">GitHub Repository</div>
                        <div className="text-[12px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                          {session ? `Signed in as ${session.user?.name ?? 'you'}` : 'Use any public GitHub repo'}
                        </div>
                      </div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M5 3.5L8.5 7 5 10.5" stroke="rgba(255,255,255,0.2)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {!showCreateForm ? (
                    <button
                      className="w-full flex items-center justify-between gap-4 rounded-xl px-4 py-3.5 transition-colors hover:bg-white/[0.03] text-left"
                      style={{ border: '1px solid rgba(255,255,255,0.07)' }}
                      onClick={() => session ? setShowCreateForm(true) : signIn('github')}
                    >
                      <div className="flex items-center gap-3">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5">
                          <path d="M12 4v16M4 12h16" strokeLinecap="round"/>
                        </svg>
                        <div>
                          <div className="text-sm font-medium text-white">Create new project</div>
                          <div className="text-[12px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                            {session ? 'New GitHub repo from this workspace' : 'Sign in with GitHub to create'}
                          </div>
                        </div>
                      </div>
                    </button>
                  ) : createdRepo ? (
                    <div
                      className="rounded-xl px-4 py-4 text-center"
                      style={{ border: '1px solid rgba(255,255,255,0.07)' }}
                    >
                      <div className="text-sm text-white mb-1">Repo created</div>
                      <a href={createdRepo} target="_blank" rel="noopener noreferrer" className="text-sm underline" style={{ color: 'rgba(255,255,255,0.45)' }}>
                        {createdRepo}
                      </a>
                    </div>
                  ) : (
                    <div
                      className="rounded-xl px-4 py-4"
                      style={{ border: '1px solid rgba(255,255,255,0.07)' }}
                    >
                      <div className="flex items-center gap-3">
                        <span className="mono text-[12px]" style={{ color: 'rgba(255,255,255,0.28)', whiteSpace: 'nowrap' }}>reform-</span>
                        <input
                          autoFocus
                          type="text"
                          placeholder="project-name"
                          value={newRepoName}
                          onChange={(e) => setNewRepoName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleCreateRepo()}
                          className="flex-1 bg-transparent outline-none text-sm rounded-none border-b pb-1.5"
                          style={{ color: 'rgba(255,255,255,0.84)', borderColor: 'rgba(255,255,255,0.12)' }}
                        />
                      </div>
                      <div className="flex items-center gap-3 mt-3">
                        <button
                          onClick={handleCreateRepo}
                          disabled={!newRepoName.trim() || creatingRepo}
                          className="btn-primary px-4 py-2 rounded-lg text-xs font-semibold"
                          style={{ opacity: creatingRepo ? 0.6 : 1 }}
                        >
                          {creatingRepo ? 'Creating...' : 'Create'}
                        </button>
                        <button onClick={() => setShowCreateForm(false)} className="link-muted text-xs">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Steps — minimal, no cards */}
                <div className="mt-16 sm:mt-20">
                  <div className="flex items-center gap-2 mb-8">
                    <div className="w-1 h-1 rounded-full" style={{ background: 'rgba(170,180,255,0.5)' }} />
                    <span className="mono text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>How it works</span>
                  </div>
                  <div className="grid sm:grid-cols-3 gap-10 sm:gap-8">
                    {STEPS.map((step) => (
                      <div key={step.num}>
                        <div className="mono text-[11px] mb-2" style={{ color: 'rgba(170,180,255,0.5)' }}>{step.num}</div>
                        <p className="text-[14px]" style={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.65 }}>{step.text}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Process notes — clean list */}
                <div className="mt-16 sm:mt-20" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '2.5rem' }}>
                  <div className="flex items-center gap-2 mb-8">
                    <div className="w-1 h-1 rounded-full" style={{ background: 'rgba(170,180,255,0.5)' }} />
                    <span className="mono text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>What to know</span>
                  </div>
                  <div className="space-y-5">
                    {PROCESS_NOTES.map((note) => (
                      <p key={note} className="text-[14px]" style={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.7 }}>
                        {note}
                      </p>
                    ))}
                  </div>
                </div>

                {/* Footer context */}
                <div className="mt-16 sm:mt-20 pb-8" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '2.5rem' }}>
                  <div className="sm:flex sm:items-start sm:justify-between gap-12">
                    <div className="mb-6 sm:mb-0">
                      <div className="mono text-[11px] mb-2" style={{ color: 'rgba(255,255,255,0.25)' }}>Outcome</div>
                      <p className="text-[14px] max-w-sm" style={{ color: 'rgba(255,255,255,0.45)', lineHeight: 1.7 }}>
                        Better UI signal before any code transformation starts. The intake flow frames the repo, design intent, and next steps in one place.
                      </p>
                    </div>
                    <div>
                      <div className="mono text-[11px] mb-2" style={{ color: 'rgba(255,255,255,0.25)' }}>Constraint</div>
                      <p className="text-[14px] max-w-sm" style={{ color: 'rgba(255,255,255,0.45)', lineHeight: 1.7 }}>
                        Frontend redesign only. This stage improves visual quality and structure, not product flows. Works with any public GitHub repo.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
