"""
UX Lab API routes.

POST /api/ux-lab/analyze          — run the full pipeline on a URL
GET  /api/ux-lab/sessions         — list last 10 sessions for a workspace
GET  /api/ux-lab/sessions/{id}    — get one session by ID
POST /api/ux-lab/sessions/{id}/apply — mark a finding as patched
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import UXLabSession as UXLabSessionModel
from app.schemas.ux_lab import AnalyzeRequest, ApplyFindingRequest, SessionOut
from app.services.s3_client import download_screenshot, upload_screenshot
from app.services.ux_lab_service import run_analysis

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ux-lab", tags=["ux-lab"])


def _session_to_out(session: UXLabSessionModel) -> SessionOut:
    findings_raw = session.findings_json or []
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
            "requires_competitor_evidence": f.get("requires_competitor_evidence", False),
            "competitor_evidence": [
                {
                    "url": e.get("url", ""),
                    "screenshot_url": e.get("screenshot_url", ""),
                    "annotation": e.get("annotation", ""),
                }
                for e in f.get("competitor_evidence", [])
            ],
            "annotation": f.get("annotation", {"xPercent": 50, "yPercent": 50}),
        })

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
        findings=findings_out,
        created_at=session.created_at.isoformat(),
        status=session.status,
    )


@router.post("/analyze", response_model=SessionOut)
async def analyze(req: AnalyzeRequest, db: AsyncSession = Depends(get_db)):
    """Run the full UX analysis pipeline on a URL and persist the session."""
    # Create a pending session immediately so the client can poll
    session = UXLabSessionModel(
        workspace_id=req.workspace_id,
        url=req.url,
        page=req.page,
        status="pending",
    )
    db.add(session)
    await db.flush()
    session_id = session.id

    try:
        result = await run_analysis(req.url, req.page, req.competitor_urls)

        # Upload screenshots to S3
        before_key = upload_screenshot(str(session_id), req.page, "before", result["before_b64"])
        after_key = upload_screenshot(str(session_id), req.page, "after", result["after_b64"])

        session.before_screenshot_key = before_key
        session.after_screenshot_key = after_key
        session.findings_json = result["findings"]
        session.status = "complete"

    except Exception as exc:
        logger.error("UX Lab analysis failed for %s: %s", req.url, exc)
        session.status = "error"
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}") from exc

    return _session_to_out(session)


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
