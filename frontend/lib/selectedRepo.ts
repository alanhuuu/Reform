/**
 * Centralized read/write for the user's currently-selected repo.
 *
 * Writes go to BOTH sessionStorage (per-tab, legacy key used everywhere)
 * and localStorage (per-device, survives tab switches and new tabs). Reads
 * prefer sessionStorage but fall back to localStorage so a user who picked
 * a repo in /new and later opens /dashboard/transform in a new tab still
 * sees their selection carried over.
 *
 * Every page that previously touched `refineui_repo` / `refineui_branch`
 * directly should go through these helpers.
 */

const REPO_KEY = 'refineui_repo'
const BRANCH_KEY = 'refineui_branch'

export interface SelectedRepo {
  url: string
  branch: string
}

export function getSelectedRepo(): SelectedRepo | null {
  if (typeof window === 'undefined') return null

  let url = ''
  let branch = ''

  try {
    url = sessionStorage.getItem(REPO_KEY) || ''
    branch = sessionStorage.getItem(BRANCH_KEY) || ''
  } catch {
    /* sessionStorage disabled / blocked */
  }

  if (!url) {
    try {
      url = localStorage.getItem(REPO_KEY) || ''
      if (!branch) branch = localStorage.getItem(BRANCH_KEY) || ''
    } catch {
      /* localStorage disabled / blocked */
    }
  }

  if (!url) return null

  // Mirror the localStorage value back into sessionStorage so subsequent
  // direct sessionStorage reads (legacy call sites) also find it.
  try {
    if (!sessionStorage.getItem(REPO_KEY)) sessionStorage.setItem(REPO_KEY, url)
    if (branch && !sessionStorage.getItem(BRANCH_KEY)) sessionStorage.setItem(BRANCH_KEY, branch)
  } catch {
    /* ignore */
  }

  return { url, branch: branch || 'main' }
}

export function setSelectedRepo(url: string, branch: string = 'main'): void {
  if (typeof window === 'undefined' || !url) return
  const safeBranch = branch || 'main'
  try {
    sessionStorage.setItem(REPO_KEY, url)
    sessionStorage.setItem(BRANCH_KEY, safeBranch)
  } catch {
    /* session quota / disabled */
  }
  try {
    localStorage.setItem(REPO_KEY, url)
    localStorage.setItem(BRANCH_KEY, safeBranch)
  } catch {
    /* local quota / disabled */
  }
}

export function clearSelectedRepo(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(REPO_KEY)
    sessionStorage.removeItem(BRANCH_KEY)
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(REPO_KEY)
    localStorage.removeItem(BRANCH_KEY)
  } catch {
    /* ignore */
  }
}
