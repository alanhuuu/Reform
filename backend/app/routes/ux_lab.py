"""
UX Lab API routes.

POST /api/ux-lab/analyze          — run the full pipeline on a URL
GET  /api/ux-lab/sessions         — list last 10 sessions for a workspace
GET  /api/ux-lab/sessions/{id}    — get one session by ID
POST /api/ux-lab/sessions/{id}/apply — mark a finding as patched
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db, get_optional_db
from app.models import UXLabSession as UXLabSessionModel
from app.schemas.ux_lab import AnalyzeRequest, ApplyFindingRequest, SessionOut
from app.services.s3_client import download_screenshot, upload_screenshot
from app.services.ux_lab_service import run_analysis

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ux-lab", tags=["ux-lab"])


def _findings_to_out(findings_raw: list[dict]) -> list[dict]:
    findings_out = []
    for f in findings_raw:
        findings_out.append({
            "id": f.get("id", ""),
            "type": f.get("type", "ISSUE"),
            "severity": f.get("severity", "minor"),
            "status": f.get("status", "open"),
            "component": f.get("component", ""),
            "title": f.get("title", ""),
            "description": f.get("description", ""),
            "principle": f.get("principle", ""),
            "principle_explanation": f.get("principle_explanation", ""),
            "recommendation": f.get("recommendation", ""),
            "annotation": f.get("annotation", {"xPercent": 50, "yPercent": 50}),
        })
    return findings_out


def _session_to_out(
    session: UXLabSessionModel,
    after_preview_message_override: str | None = None,
) -> SessionOut:
    return SessionOut(
        id=str(session.id),
        url=session.url,
        page=session.page,
        before_screenshot_url=f"data:image/png;base64,{download_screenshot(session.before_screenshot_key)}"
        if session.before_screenshot_key
        else "",
        after_screenshot_url=f"data:image/png;base64,{download_screenshot(session.after_screenshot_key)}"
        if session.after_screenshot_key
        else "",
        after_preview_message=(
            after_preview_message_override
            if after_preview_message_override is not None
            else (
                "We found UX issues for this page, but no modified preview screenshot is available for this run."
                if session.status == "complete" and not session.after_screenshot_key
                else None
            )
        ),
        findings=_findings_to_out(session.findings_json or []),
        created_at=session.created_at.isoformat(),
        status=session.status,
    )


@router.post("/analyze", response_model=SessionOut)
async def analyze(req: AnalyzeRequest, db: AsyncSession | None = Depends(get_optional_db)):
    """Run the UX analysis pipeline and optionally persist the session."""
    if req.analysis_only:
        try:
            result = await run_analysis(
                req.repo_url,
                req.branch,
                req.page,
                access_token=req.access_token,
                analysis_only=True,
            )
        except Exception as exc:
            logger.error("UX Lab analysis-only run failed for %s: %s", req.repo_url, exc)
            raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}") from exc

        return SessionOut(
            id=str(uuid.uuid4()),
            url=req.repo_url,
            page=req.page,
            before_screenshot_url=f"data:image/png;base64,{result['before_b64']}",
            after_screenshot_url="",
            after_preview_message=result.get("after_message"),
            findings=_findings_to_out(result["findings"]),
            created_at=datetime.now(timezone.utc).isoformat(),
            status="complete",
        )

    if db is None:
        raise HTTPException(status_code=500, detail="DATABASE_URL not configured")

    """Run the full UX analysis pipeline on a URL and persist the session."""
    # Create a pending session immediately so the client can poll
    session = UXLabSessionModel(
        workspace_id=req.workspace_id,
        url=req.repo_url,
        page=req.page,
        status="pending",
    )
    db.add(session)
    await db.flush()
    session_id = session.id

    try:
        result = await run_analysis(
            req.repo_url,
            req.branch,
            req.page,
            access_token=req.access_token,
            analysis_only=req.analysis_only,
        )

        # Upload screenshots to S3
        before_key = upload_screenshot(str(session_id), req.page, "before", result["before_b64"])
        after_key = (
            upload_screenshot(str(session_id), req.page, "after", result["after_b64"])
            if result.get("after_b64")
            else None
        )

        session.before_screenshot_key = before_key
        session.after_screenshot_key = after_key
        session.findings_json = result["findings"]
        session.status = "complete"

    except Exception as exc:
        logger.error("UX Lab analysis failed for %s: %s", req.repo_url, exc)
        session.status = "error"
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}") from exc


    return _session_to_out(
        session,
        after_preview_message_override=result.get("after_message"),
    )


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(workspace_id: str, db: AsyncSession = Depends(get_db)):
    """Return the last 10 sessions for a workspace."""
    result = await db.execute(
        select(UXLabSessionModel)
        .where(UXLabSessionModel.workspace_id == workspace_id)
        .order_by(UXLabSessionModel.created_at.desc())
        .limit(10)
    )
    sessions = result.scalars().all()
    return [_session_to_out(s) for s in sessions]


@router.get("/sessions/{session_id}", response_model=SessionOut)
async def get_session(session_id: str, db: AsyncSession = Depends(get_db)):
    """Get a single session by ID."""
    result = await db.execute(
        select(UXLabSessionModel).where(UXLabSessionModel.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return _session_to_out(session)


@router.post("/sessions/{session_id}/apply")
async def apply_finding(
    session_id: str,
    req: ApplyFindingRequest,
    db: AsyncSession = Depends(get_db),
):
    """Mark a specific finding as patched."""
    result = await db.execute(
        select(UXLabSessionModel).where(UXLabSessionModel.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    findings = list(session.findings_json or [])
    updated = False
    for finding in findings:
        if finding.get("id") == req.finding_id:
            finding["status"] = "patched"
            updated = True
            break

    if not updated:
        raise HTTPException(status_code=404, detail="Finding not found")

    session.findings_json = findings
    return {"ok": True, "finding_id": req.finding_id, "status": "patched"}
