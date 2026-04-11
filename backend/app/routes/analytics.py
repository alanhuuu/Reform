"""
Analytics routes — admin overview of users, usage, and site visits.
"""

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import (
    PageResult,
    Project,
    SiteVisit,
    TransformRun,
    UserSubscription,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])

ANALYTICS_PASSWORD = "password123"
ACTIVE_TIMEOUT_SECONDS = 60

# In-memory heartbeat store: {session_id: {last_seen, path, github_user_id}}
_active_sessions: dict[str, dict] = {}


def _clean_stale_sessions() -> None:
    """Remove sessions that haven't sent a heartbeat within the timeout."""
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=ACTIVE_TIMEOUT_SECONDS)
    stale = [sid for sid, info in _active_sessions.items() if info["last_seen"] < cutoff]
    for sid in stale:
        del _active_sessions[sid]


# ── Request schemas ─────────────────────────────────────────────────────

class TrackVisitRequest(BaseModel):
    duration_seconds: int
    github_user_id: str | None = None
    path: str = "/"


class HeartbeatRequest(BaseModel):
    session_id: str
    github_user_id: str | None = None
    path: str = "/"


# ── Routes ──────────────────────────────────────────────────────────────

@router.get("/overview")
async def analytics_overview(
    password: str = "",
    db: AsyncSession = Depends(get_db),
):
    """Return aggregated analytics for the admin dashboard."""
    if password != ANALYTICS_PASSWORD:
        raise HTTPException(status_code=403, detail="Invalid password")

    now = datetime.now(timezone.utc)
    thirty_days_ago = now - timedelta(days=30)

    # ── Users ───────────────────────────────────────────────────────────
    total_users = (await db.execute(
        select(func.count()).select_from(UserSubscription)
    )).scalar() or 0

    by_plan_rows = (await db.execute(
        select(UserSubscription.plan, func.count())
        .group_by(UserSubscription.plan)
    )).all()
    by_plan = {row[0]: row[1] for row in by_plan_rows}

    by_status_rows = (await db.execute(
        select(UserSubscription.subscription_status, func.count())
        .group_by(UserSubscription.subscription_status)
    )).all()
    by_status = {row[0]: row[1] for row in by_status_rows}

    new_last_30d = (await db.execute(
        select(func.count()).select_from(UserSubscription)
        .where(UserSubscription.created_at >= thirty_days_ago)
    )).scalar() or 0

    signups_rows = (await db.execute(
        select(
            func.date_trunc("day", UserSubscription.created_at).label("day"),
            func.count(),
        )
        .where(UserSubscription.created_at >= thirty_days_ago)
        .group_by("day")
        .order_by("day")
    )).all()
    signups_per_day = [
        {"date": row[0].strftime("%Y-%m-%d"), "count": row[1]}
        for row in signups_rows
    ]

    # ── Usage ───────────────────────────────────────────────────────────
    total_scans = (await db.execute(
        select(func.coalesce(func.sum(UserSubscription.scans_used_this_month), 0))
    )).scalar()

    total_repos = (await db.execute(
        select(func.coalesce(func.sum(UserSubscription.repos_connected), 0))
    )).scalar()

    total_projects = (await db.execute(
        select(func.count()).select_from(Project)
    )).scalar() or 0

    total_runs = (await db.execute(
        select(func.count()).select_from(TransformRun)
    )).scalar() or 0

    runs_status_rows = (await db.execute(
        select(TransformRun.status, func.count())
        .group_by(TransformRun.status)
    )).all()
    runs_by_status = {row[0]: row[1] for row in runs_status_rows}

    pages_found = (await db.execute(
        select(func.coalesce(func.sum(TransformRun.total_pages_found), 0))
    )).scalar()

    pages_transformed = (await db.execute(
        select(func.coalesce(func.sum(TransformRun.total_transformed), 0))
    )).scalar()

    pages_skipped = (await db.execute(
        select(func.coalesce(func.sum(TransformRun.total_skipped), 0))
    )).scalar()

    avg_score = (await db.execute(
        select(func.avg(PageResult.score))
        .where(PageResult.status == "transformed")
    )).scalar()

    runs_day_rows = (await db.execute(
        select(
            func.date_trunc("day", TransformRun.created_at).label("day"),
            func.count(),
        )
        .where(TransformRun.created_at >= thirty_days_ago)
        .group_by("day")
        .order_by("day")
    )).all()
    runs_per_day = [
        {"date": row[0].strftime("%Y-%m-%d"), "count": row[1]}
        for row in runs_day_rows
    ]

    # ── Site visits ─────────────────────────────────────────────────────
    total_visits = (await db.execute(
        select(func.count()).select_from(SiteVisit)
    )).scalar() or 0

    total_time_minutes = (await db.execute(
        select(func.coalesce(func.sum(SiteVisit.duration_seconds), 0))
    )).scalar() / 60.0

    avg_session = (await db.execute(
        select(func.avg(SiteVisit.duration_seconds))
    )).scalar()

    # ── Active users (in-memory heartbeats) ─────────────────────────────
    _clean_stale_sessions()
    active_now = len(_active_sessions)
    active_paths: dict[str, int] = {}
    for info in _active_sessions.values():
        p = info["path"]
        active_paths[p] = active_paths.get(p, 0) + 1

    return {
        "users": {
            "total": total_users,
            "by_plan": by_plan,
            "by_status": by_status,
            "new_last_30d": new_last_30d,
            "signups_per_day": signups_per_day,
        },
        "usage": {
            "total_scans": total_scans,
            "total_repos": total_repos,
            "total_projects": total_projects,
            "total_runs": total_runs,
            "runs_by_status": runs_by_status,
            "total_pages_found": pages_found,
            "total_pages_transformed": pages_transformed,
            "total_pages_skipped": pages_skipped,
            "avg_page_score": round(avg_score, 1) if avg_score else 0,
            "runs_per_day": runs_per_day,
        },
        "site_visits": {
            "total_visits": total_visits,
            "total_time_minutes": round(total_time_minutes, 1),
            "avg_session_seconds": round(avg_session, 1) if avg_session else 0,
        },
        "active": {
            "count": active_now,
            "paths": active_paths,
        },
    }


@router.post("/heartbeat")
async def heartbeat(body: HeartbeatRequest):
    """Register a heartbeat from an active user session."""
    _active_sessions[body.session_id] = {
        "last_seen": datetime.now(timezone.utc),
        "path": body.path,
        "github_user_id": body.github_user_id,
    }
    return {"ok": True}


@router.post("/track-visit")
async def track_visit(
    body: TrackVisitRequest,
    db: AsyncSession = Depends(get_db),
):
    """Record a site visit duration."""
    if body.duration_seconds < 1 or body.duration_seconds > 86400:
        raise HTTPException(status_code=400, detail="Invalid duration")

    visit = SiteVisit(
        github_user_id=body.github_user_id,
        path=body.path,
        duration_seconds=body.duration_seconds,
    )
    db.add(visit)
    return {"ok": True}
