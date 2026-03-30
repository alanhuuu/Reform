/**
 * Central API configuration for Reform frontend.
 * All backend calls go through this module.
 */

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '') || 'http://localhost:8000'

/**
 * Build a full API URL from a path.
 * @param path — e.g. "/ingest-repo" or "/analyze-code"
 */
export function apiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL}${cleanPath}`
}

export { API_BASE_URL }
