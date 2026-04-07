"""
Project and transform run API routes.

These endpoints let the frontend create projects, list past transforms,
and load full results including screenshots from S3.
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import get_db
from app.models import Project, RepoSnapshot, TransformRun, PageResult
from app.services.s3_client import download_screenshot, upload_snapshot, upload_screenshot

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["projects"])


# ─── Request/Response Schemas ────────────────────────────────────────

class CreateProjectRequest(BaseModel):
    github_user_id: str
    github_username: str
    repo_name: str       # "owner/repo"
    repo_url: str        # "https://github.com/owner/repo"
    branch: str = "main"


class ProjectResponse(BaseModel):
    id: str
    github_user_id: str
    github_username: str
    repo_name: str
    repo_url: str
    branch: str
    created_at: str
    updated_at: str
    latest_run_status: str | None = None
    total_runs: int = 0

    class Config:
        from_attributes = True


class PageResultResponse(BaseModel):
    page_path: str
    page_name: str
    route: str
    score: int
    status: str
    original_code: str
    updated_code: str
    diff_summary: str
    change_annotations: list
    change_summary: list
    before_screenshot: str  # base64 — fetched from S3
    after_screenshot: str   # base64 — fetched from S3
    error: str
    retries_used: int


class RunResponse(BaseModel):
    id: str
    project_id: str
    status: str
    user_intent: str
    total_pages_found: int
    total_transformed: int
    total_skipped: int
    global_summary: list
    pipeline_errors: list
    created_at: str
    completed_at: str | None
    repo_name: str
    branch: str
    framework: str
    pages: list[PageResultResponse]


class SaveRunRequest(BaseModel):
    """Saves a completed transform run to the database."""
    github_user_id: str
    github_username: str
    repo_name: str
    repo_url: str
    branch: str
    framework: str
    user_intent: str = ""
    design_intelligence: dict | None = None
    # File snapshot
    file_tree: list[str] = []
    files: list[dict] = []
    # Run results
    total_pages_found: int = 0
    total_transformed: int = 0
    total_skipped: int = 0
    global_summary: list[str] = []
    pipeline_errors: list[str] = []
    pages: list[dict] = []


# ─── Routes ──────────────────────────────────────────────────────────

@router.post("", response_model=ProjectResponse)
async def create_project(req: CreateProjectRequest, db: AsyncSession = Depends(get_db)):
    """Create a new project or return existing one for this repo."""
    # Check if project already exists for this user + repo
    result = await db.execute(
        select(Project).where(
            Project.github_user_id == req.github_user_id,
            Project.repo_name == req.repo_name,
        )
    )
    project = result.scalar_one_or_none()

    if project:
        project.updated_at = datetime.now(timezone.utc)
        project.branch = req.branch
    else:
        project = Project(
            github_user_id=req.github_user_id,
            github_username=req.github_username,
            repo_name=req.repo_name,
            repo_url=req.repo_url,
            branch=req.branch,
        )
        db.add(project)

    await db.flush()

    # Count runs
    runs_result = await db.execute(
        select(TransformRun).where(TransformRun.project_id == project.id)
    )
    runs = runs_result.scalars().all()

    return ProjectResponse(
        id=str(project.id),
        github_user_id=project.github_user_id,
        github_username=project.github_username,
        repo_name=project.repo_name,
        repo_url=project.repo_url,
        branch=project.branch,
        created_at=project.created_at.isoformat(),
        updated_at=project.updated_at.isoformat(),
        latest_run_status=runs[-1].status if runs else None,
        total_runs=len(runs),
    )


@router.get("", response_model=list[ProjectResponse])
async def list_projects(github_user_id: str, db: AsyncSession = Depends(get_db)):
    """List all projects for a GitHub user."""
    result = await db.execute(
        select(Project)
        .where(Project.github_user_id == github_user_id)
        .order_by(Project.updated_at.desc())
    )
    projects = result.scalars().all()

    responses = []
    for project in projects:
        runs_result = await db.execute(
            select(TransformRun)
            .where(TransformRun.project_id == project.id)
            .order_by(TransformRun.created_at.desc())
        )
        runs = runs_result.scalars().all()

        responses.append(ProjectResponse(
            id=str(project.id),
            github_user_id=project.github_user_id,
            github_username=project.github_username,
            repo_name=project.repo_name,
            repo_url=project.repo_url,
            branch=project.branch,
            created_at=project.created_at.isoformat(),
            updated_at=project.updated_at.isoformat(),
            latest_run_status=runs[0].status if runs else None,
            total_runs=len(runs),
        ))

    return responses


@router.get("/{project_id}/runs", response_model=list[dict])
async def list_runs(project_id: str, db: AsyncSession = Depends(get_db)):
    """List all transform runs for a project (metadata only, no page results)."""
    result = await db.execute(
        select(TransformRun)
        .where(TransformRun.project_id == project_id)
        .order_by(TransformRun.created_at.desc())
    )
    runs = result.scalars().all()

    return [
        {
            "id": str(run.id),
            "status": run.status,
            "user_intent": run.user_intent,
            "total_pages_found": run.total_pages_found,
            "total_transformed": run.total_transformed,
            "total_skipped": run.total_skipped,
            "created_at": run.created_at.isoformat(),
            "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        }
        for run in runs
    ]


@router.get("/runs/{run_id}", response_model=RunResponse)
async def get_run(run_id: str, db: AsyncSession = Depends(get_db)):
    """Get full run results including page data and screenshots from S3."""
    result = await db.execute(
        select(TransformRun)
        .where(TransformRun.id == run_id)
        .options(selectinload(TransformRun.page_results))
    )
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    # Get project info
    proj_result = await db.execute(select(Project).where(Project.id == run.project_id))
    project = proj_result.scalar_one()

    # Get snapshot for framework info
    framework = "unknown"
    if run.snapshot_id:
        snap_result = await db.execute(select(RepoSnapshot).where(RepoSnapshot.id == run.snapshot_id))
        snap = snap_result.scalar_one_or_none()
        if snap:
            framework = snap.framework

    # Build page responses — fetch screenshots from S3
    pages = []
    for pr in run.page_results:
        before_b64 = download_screenshot(pr.before_screenshot_key) if pr.before_screenshot_key else ""
        after_b64 = download_screenshot(pr.after_screenshot_key) if pr.after_screenshot_key else ""

        pages.append(PageResultResponse(
            page_path=pr.page_path,
            page_name=pr.page_name,
            route=pr.route,
            score=pr.score,
            status=pr.status,
            original_code=pr.original_code,
            updated_code=pr.updated_code,
            diff_summary=pr.diff_summary,
            change_annotations=pr.change_annotations or [],
            change_summary=pr.change_summary or [],
            before_screenshot=before_b64,
            after_screenshot=after_b64,
            error=pr.error,
            retries_used=pr.retries_used,
        ))

    return RunResponse(
        id=str(run.id),
        project_id=str(run.project_id),
        status=run.status,
        user_intent=run.user_intent or "",
        total_pages_found=run.total_pages_found,
        total_transformed=run.total_transformed,
        total_skipped=run.total_skipped,
        global_summary=run.global_summary or [],
        pipeline_errors=run.pipeline_errors or [],
        created_at=run.created_at.isoformat(),
        completed_at=run.completed_at.isoformat() if run.completed_at else None,
        repo_name=project.repo_name,
        branch=project.branch,
        framework=framework,
        pages=pages,
    )


@router.post("/save-run")
async def save_run(req: SaveRunRequest, db: AsyncSession = Depends(get_db)):
    """Save a completed transform run to the database + S3.

    Called by the frontend after a transform completes.
    Creates project (if new), snapshot, run, and page results.
    Uploads screenshots and repo files to S3.
    """
    # 1. Create or get project
    result = await db.execute(
        select(Project).where(
            Project.github_user_id == req.github_user_id,
            Project.repo_name == req.repo_name,
        )
    )
    project = result.scalar_one_or_none()

    if not project:
        project = Project(
            github_user_id=req.github_user_id,
            github_username=req.github_username,
            repo_name=req.repo_name,
            repo_url=req.repo_url,
            branch=req.branch,
        )
        db.add(project)
        await db.flush()
    else:
        project.updated_at = datetime.now(timezone.utc)

    # 2. Create repo snapshot and upload files to S3
    snapshot = RepoSnapshot(
        project_id=project.id,
        file_tree=req.file_tree,
        framework=req.framework,
        file_count=len(req.files),
    )
    db.add(snapshot)
    await db.flush()

    if req.files:
        s3_key = upload_snapshot(str(project.id), str(snapshot.id), req.files)
        snapshot.s3_key = s3_key

    # 3. Create transform run
    run = TransformRun(
        project_id=project.id,
        snapshot_id=snapshot.id,
        status="complete",
        design_intelligence=req.design_intelligence,
        user_intent=req.user_intent,
        total_pages_found=req.total_pages_found,
        total_transformed=req.total_transformed,
        total_skipped=req.total_skipped,
        global_summary=req.global_summary,
        pipeline_errors=req.pipeline_errors,
        completed_at=datetime.now(timezone.utc),
    )
    db.add(run)
    await db.flush()

    # 4. Create page results and upload screenshots to S3
    for page in req.pages:
        before_key = ""
        after_key = ""

        if page.get("before_screenshot"):
            before_key = upload_screenshot(str(run.id), page["page_path"], "before", page["before_screenshot"])
        if page.get("after_screenshot"):
            after_key = upload_screenshot(str(run.id), page["page_path"], "after", page["after_screenshot"])

        pr = PageResult(
            run_id=run.id,
            page_path=page.get("page_path", ""),
            page_name=page.get("page_name", ""),
            route=page.get("route", "/"),
            score=page.get("score", 0),
            status=page.get("status", "error"),
            original_code=page.get("original_code", ""),
            updated_code=page.get("updated_code", ""),
            diff_summary=page.get("diff_summary", ""),
            change_annotations=page.get("change_annotations", []),
            change_summary=page.get("change_summary", []),
            before_screenshot_key=before_key,
            after_screenshot_key=after_key,
            error=page.get("error", ""),
            retries_used=page.get("retries_used", 0),
        )
        db.add(pr)

    logger.info(
        "Saved run %s for %s: %d pages, %d transformed",
        run.id, req.repo_name, req.total_pages_found, req.total_transformed,
    )

    return {
        "project_id": str(project.id),
        "run_id": str(run.id),
        "snapshot_id": str(snapshot.id),
    }
