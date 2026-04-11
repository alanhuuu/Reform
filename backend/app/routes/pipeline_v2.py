"""Route for the multi-page transformation pipeline v2."""

import asyncio
import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_optional_db
from app.schemas.pipeline_v2 import TransformRepoV2Request
from app.services.pipeline_orchestrator import run_pipeline_v2
from app.services.subscription import get_or_create_subscription, increment_scan_usage

logger = logging.getLogger(__name__)

router = APIRouter()

# Heartbeat cadence for the streaming response. Has to be shorter than the
# most aggressive mobile-carrier / corporate-proxy idle-TCP timeout we care
# about — some Indian carriers kill idle sockets at ~60s, so 10s gives us a
# ~6x safety margin while staying cheap to emit.
_HEARTBEAT_INTERVAL_SECONDS = 10


@router.post("/transform-repo-v2")
async def transform_repo_v2(
    req: TransformRepoV2Request,
    db: AsyncSession | None = Depends(get_optional_db),
):
    """
    Full multi-page transformation pipeline.

    Streams newline-delimited JSON (NDJSON) so the response socket stays
    warm across proxies and NATs that silently kill idle TCP connections
    during long runs. The frontend reads the stream, drops heartbeats,
    and uses the single `result` message as the final payload.
    """
    # ── Feature gating (before the stream opens so 402/429 errors stay
    #    as normal HTTP status codes the frontend already knows how to
    #    parse via parseResponseError). ────────────────────────────────
    if db is not None and req.github_user_id:
        sub = await get_or_create_subscription(db, req.github_user_id)
        await increment_scan_usage(db, sub)

    async def event_stream():
        # Kick off the real work as a background task so we can yield
        # heartbeats on a timer while it runs. asyncio.shield prevents
        # wait_for's timeout from cancelling the underlying task.
        task = asyncio.create_task(run_pipeline_v2(
            github_url=req.github_url,
            branch=req.branch,
            access_token=req.access_token,
            design_intelligence=req.design_intelligence,
            user_intent=req.user_intent,
            quality_threshold=req.quality_threshold,
            max_pages=req.max_pages,
            ux_lab_findings=req.ux_lab_findings,
        ))

        while not task.done():
            try:
                await asyncio.wait_for(asyncio.shield(task), timeout=_HEARTBEAT_INTERVAL_SECONDS)
            except asyncio.TimeoutError:
                yield json.dumps({"type": "heartbeat"}) + "\n"

        try:
            result = task.result()
        except ValueError as e:
            logger.warning("Pipeline v2 ValueError: %s", e)
            yield json.dumps({"type": "error", "status": 400, "detail": str(e)}) + "\n"
            return
        except Exception as e:
            logger.exception("Pipeline v2 failed")
            yield json.dumps({"type": "error", "status": 500, "detail": str(e)}) + "\n"
            return

        yield json.dumps({"type": "result", "data": result}) + "\n"

    return StreamingResponse(event_stream(), media_type="application/x-ndjson")
