"""Route for the multi-page transformation pipeline v2."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.schemas.pipeline_v2 import TransformRepoV2Request, TransformRepoV2Response
from app.services.pipeline_orchestrator import run_pipeline_v2
from app.services.subscription import get_or_create_subscription, increment_scan_usage

router = APIRouter()


@router.post("/transform-repo-v2", response_model=TransformRepoV2Response)
async def transform_repo_v2(
    req: TransformRepoV2Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Full multi-page transformation pipeline.

    1. Ingests the repository
    2. Discovers all frontend pages
    3. Evaluates UI quality per page (0-100)
    4. Skips high-quality pages (score >= threshold)
    5. Transforms weak pages with structural validation
    6. Renders before/after screenshots for top pages
    7. Returns per-page results
    """
    # ── Feature gating ──────────────────────────────────────────────
    sub = await get_or_create_subscription(db, req.github_user_id)
    await increment_scan_usage(db, sub)

    try:
        result = await run_pipeline_v2(
            github_url=req.github_url,
            branch=req.branch,
            access_token=req.access_token,
            design_intelligence=req.design_intelligence,
            user_intent=req.user_intent,
            quality_threshold=req.quality_threshold,
            max_pages=req.max_pages,
            ux_lab_findings=req.ux_lab_findings,
        )
        return TransformRepoV2Response(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
