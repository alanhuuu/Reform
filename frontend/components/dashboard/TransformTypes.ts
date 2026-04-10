/** Shared types for the transformation results UI. */

export interface ChangeAnnotation {
  region: string
  change_type: string
  description: string
  ux_impact: string
}

export interface ScoreBreakdown {
  layout_structure: number
  visual_hierarchy: number
  spacing_consistency: number
  cta_clarity: number
  component_quality: number
  information_density: number
}

export interface PageIssue {
  area: string
  severity: 'high' | 'medium' | 'low' | string
  description: string
}

export interface TransformedPageData {
  page_path: string
  page_name: string
  route: string
  status: 'transformed' | 'weak' | 'high_quality' | 'skipped_overflow' | 'error'
  score: number
  breakdown?: ScoreBreakdown | null
  reasoning?: string
  issues?: PageIssue[]
  original_code?: string
  updated_code?: string
  diff_summary?: string
  change_annotations?: ChangeAnnotation[]
  change_summary?: string[]
  before_screenshot?: string
  after_screenshot?: string
  error?: string
  retries_used?: number
}

export interface MultiPageTransformResult {
  repo_name: string
  branch: string
  framework: string
  total_pages_found: number
  total_evaluated: number
  total_transformed: number
  total_skipped: number
  pages: TransformedPageData[]
  global_summary: string[]
  pipeline_errors?: string[]
}

// ── Preview availability helpers ───────────────────────────────────

/** Check if a single page has usable preview screenshots. */
export function isPagePreviewAvailable(page: TransformedPageData): boolean {
  return !!(page.before_screenshot || page.after_screenshot)
}

/**
 * Check if any page in the result has preview data.
 * Returns false when the repo was never deployed / screenshots failed globally.
 */
export function isPreviewAvailable(result: MultiPageTransformResult): boolean {
  return result.pages.some(p => isPagePreviewAvailable(p))
}

/**
 * Derive a human-friendly reason why preview is unavailable.
 * Checks pipeline errors, page errors, and screenshot emptiness.
 */
export function getPreviewUnavailableReason(
  result: MultiPageTransformResult,
  page?: TransformedPageData,
): string {
  // Check page-specific error first
  if (page?.error) {
    const lower = page.error.toLowerCase()
    if (lower.includes('deploy') || lower.includes('preview') || lower.includes('server'))
      return 'This repository does not appear to have a running deployment, so a live screenshot could not be captured.'
    return `Preview could not be generated: ${page.error}`
  }

  // Check pipeline-level errors
  const previewError = result.pipeline_errors?.find(e =>
    e.toLowerCase().includes('screenshot') || e.toLowerCase().includes('preview') || e.toLowerCase().includes('deploy'),
  )
  if (previewError) {
    return 'Live preview could not be generated for this repository. The deployment may not be accessible or the dev server failed to start.'
  }

  // Fallback: screenshots simply missing
  return 'This repository does not have a detected deployment, so before/after screenshots are not available. You can still review the code transformation and structural changes.'
}

/** Legacy single-file transform result (backward compat) */
export interface LegacyTransformResult {
  transformed_files: { path: string; original_code: string; updated_code: string; diff_summary: string }[]
  change_annotations: ChangeAnnotation[]
  change_summary: string[]
  before_screenshot: string
  after_screenshot: string
  preview_route: string
  preview_error?: string
}

/**
 * Adapt a legacy single-file result into the multi-page shape
 * so the new UI can render both old and new pipeline results.
 */
export function adaptLegacyResult(
  legacy: LegacyTransformResult,
  repoName: string,
  targetFile: string,
): MultiPageTransformResult {
  const tf = legacy.transformed_files[0]
  const pageName = targetFile
    .replace(/^.*\//, '')
    .replace(/\.(tsx|jsx|ts|js)$/, '')
    .replace(/^page$/, targetFile.split('/').slice(-2, -1)[0] || 'Home')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())

  const route = legacy.preview_route || '/'

  return {
    repo_name: repoName,
    branch: 'main',
    framework: 'app_router',
    total_pages_found: 1,
    total_evaluated: 1,
    total_transformed: 1,
    total_skipped: 0,
    pages: [{
      page_path: targetFile,
      page_name: pageName,
      route,
      status: 'transformed',
      score: 0,
      original_code: tf?.original_code || '',
      updated_code: tf?.updated_code || '',
      diff_summary: tf?.diff_summary || '',
      change_annotations: legacy.change_annotations,
      change_summary: legacy.change_summary,
      before_screenshot: legacy.before_screenshot,
      after_screenshot: legacy.after_screenshot,
    }],
    global_summary: legacy.change_summary,
  }
}
