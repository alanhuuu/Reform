import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.schemas.github_publish import PublishBranchRequest, PublishBranchResponse
from app.services.github_publisher import publish_approved_branch
from app.services.subscription import (
    check_feature,
    check_subscription_active,
    get_or_create_subscription,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/github/publish-approved-branch", response_model=PublishBranchResponse)
async def publish_approved_branch_endpoint(
    req: PublishBranchRequest,
    db: AsyncSession = Depends(get_db),
):
    if not req.access_token:
        raise HTTPException(status_code=401, detail="GitHub token is required")
    if not req.approved_files:
        raise HTTPException(status_code=400, detail="No approved files provided")

    # ── Feature gating ──────────────────────────────────────────────
    sub = await get_or_create_subscription(db, req.github_user_id)
    check_subscription_active(sub)
    check_feature(sub, "pr_autofix")

    try:
        result = await publish_approved_branch(
            owner=req.owner,
            repo=req.repo,
            access_token=req.access_token,
            approved_files=[f.model_dump() for f in req.approved_files],
            pages_transformed=req.transform_summary.pages_transformed,
            summary_text=req.transform_summary.summary_text,
            base_branch=req.base_branch,
        )
        return PublishBranchResponse(success=True, **result)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.error("Branch publish failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Publish failed: {e}") from e
