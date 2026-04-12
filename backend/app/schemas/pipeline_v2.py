"""Schemas for the multi-page transformation pipeline v2."""

from pydantic import BaseModel


# ── Request ─────────────────────────────────────────────────────────

class TransformRepoV2Request(BaseModel):
    github_url: str
    branch: str = "main"
    access_token: str | None = None
    design_intelligence: dict | None = None
    user_intent: str = ""
    quality_threshold: int = 95
    max_pages: int = 5
    github_user_id: str = ""
    ux_lab_findings: list[dict] | None = None


# ── Page Discovery ──────────────────────────────────────────────────

class DiscoveredPage(BaseModel):
    name: str        # e.g. "Dashboard / Settings"
    path: str        # e.g. "app/dashboard/settings/page.tsx"
    route: str       # e.g. "/dashboard/settings"
    framework: str   # "app_router" | "pages_router"


# ── UI Evaluation ───────────────────────────────────────────────────

class ScoreBreakdown(BaseModel):
    layout_structure: int = 0
    visual_hierarchy: int = 0
    spacing_consistency: int = 0
    cta_clarity: int = 0
    component_quality: int = 0
    information_density: int = 0


class PageIssue(BaseModel):
    area: str
    severity: str        # "high" | "medium" | "low"
    description: str


class PageEvaluation(BaseModel):
    page_path: str
    page_name: str
    score: int
    breakdown: ScoreBreakdown
    issues: list[PageIssue] = []
    verdict: str         # "high_quality" | "needs_improvement"
    reasoning: str = ""


# ── Per-Page Transform Result ──────────────────────────────────────

class PageTransformResult(BaseModel):
    page_path: str
    page_name: str
    route: str
    status: str          # "transformed" | "weak" | "high_quality" | "skipped_overflow" | "error"
    score: int
    breakdown: ScoreBreakdown | None = None
    reasoning: str = ""
    issues: list[PageIssue] = []
    original_code: str = ""
    updated_code: str = ""
    diff_summary: str = ""
    change_annotations: list[dict] = []
    change_summary: list[str] = []
    # Presigned S3 URL — pipeline uploads screenshots before returning so
    # the response stays small and frontend renders via <img src> directly.
    before_screenshot: str = ""
    after_screenshot: str = ""
    # S3 object keys forwarded to /projects/save-run for direct DB persistence
    # without re-uploading.
    before_screenshot_key: str = ""
    after_screenshot_key: str = ""
    error: str = ""
    retries_used: int = 0


# ── Pipeline Response ──────────────────────────────────────────────

class TransformRepoV2Response(BaseModel):
    repo_name: str
    branch: str
    framework: str
    total_pages_found: int
    total_evaluated: int
    total_transformed: int
    total_skipped: int
    pages: list[PageTransformResult]
    global_summary: list[str]
    pipeline_errors: list[str] = []
