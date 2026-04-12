import type { MultiPageTransformResult, TransformedPageData } from '@/components/dashboard/TransformTypes'

export const TRANSFORM_CACHE_KEY = 'refineui_transform'

export interface TransformCachePayload {
  multiPageResult: MultiPageTransformResult
  repoName: string
  branch: string
}

type StripLevel = 'none' | 'screenshots' | 'screenshots-and-code'

function isQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  // Different browsers throw different names/codes for the same condition.
  return (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    /quota/i.test(err.message)
  )
}

function stripPage(page: TransformedPageData, level: StripLevel): TransformedPageData {
  if (level === 'none') return page
  const next: TransformedPageData = { ...page, before_screenshot: '', after_screenshot: '' }
  if (level === 'screenshots-and-code') {
    next.original_code = ''
    next.updated_code = ''
  }
  return next
}

function stripPayload(payload: TransformCachePayload, level: StripLevel): TransformCachePayload {
  if (level === 'none') return payload
  return {
    ...payload,
    multiPageResult: {
      ...payload.multiPageResult,
      pages: payload.multiPageResult.pages.map(p => stripPage(p, level)),
    },
  }
}

/**
 * Persist a transform run to sessionStorage, degrading gracefully when the
 * payload exceeds the browser's storage quota (~5 MB). A full multi-page
 * result with base64 screenshots can easily blow past that limit, so we
 * strip the heaviest fields rather than throw and break the UI.
 *
 * The in-memory React state is unaffected — this cache only exists so a
 * tab refresh or re-mount can rehydrate the completed view.
 */
export function safeSetTransformCache(payload: TransformCachePayload): void {
  if (typeof window === 'undefined') return
  const levels: StripLevel[] = ['none', 'screenshots', 'screenshots-and-code']
  for (const level of levels) {
    try {
      const data = stripPayload(payload, level)
      sessionStorage.setItem(TRANSFORM_CACHE_KEY, JSON.stringify(data))
      if (level !== 'none') {
        console.info(
          `[transformCache] sessionStorage quota exceeded — persisted with level="${level}". ` +
            'Reload will rehydrate without the stripped fields; full data is still in DB.',
        )
      }
      return
    } catch (err) {
      if (!isQuotaError(err)) {
        console.warn('[transformCache] Unexpected error writing cache:', err)
        return
      }
      // else: try the next, more aggressive strip level
    }
  }
  console.warn(
    '[transformCache] Could not persist transform cache even after stripping screenshots and code. ' +
      'Continuing without cache — current session is unaffected.',
  )
}
