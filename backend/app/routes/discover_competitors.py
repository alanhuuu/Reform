import logging

from fastapi import APIRouter, HTTPException

from app.schemas.discovery import (
    DiscoverRequest,
    DiscoveryResponse,
    OnboardRequest,
    OnboardResponse,
)
from app.services.anthropic_errors import is_anthropic_exception, log_and_classify
from app.services.competitor_analyzer import analyze_competitors
from app.services.competitor_discovery import discover_competitors

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/discover-competitors", response_model=DiscoveryResponse)
async def discover_competitors_endpoint(request: DiscoverRequest):
    """Discover ~50 relevant competitors from a project description."""
    if not request.project_description.strip():
        raise HTTPException(status_code=400, detail="project_description is required")

    try:
        result = discover_competitors(request.project_description)
    except Exception as e:
        if is_anthropic_exception(e):
            info = log_and_classify(e)
            raise HTTPException(status_code=info.http_status, detail=info.user_message)
        logger.error("Discovery failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Discovery failed: {e}")

    return result


@router.post("/onboard-and-analyze", response_model=OnboardResponse)
async def onboard_and_analyze_endpoint(request: OnboardRequest):
    """Full onboarding: discover competitors, then analyze the top ones."""
    if not request.project_description.strip():
        raise HTTPException(status_code=400, detail="project_description is required")

    # Step 1: Discover competitors
    try:
        discovery = discover_competitors(request.project_description)
    except Exception as e:
        if is_anthropic_exception(e):
            info = log_and_classify(e)
            raise HTTPException(status_code=info.http_status, detail=info.user_message)
        logger.error("Discovery failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Discovery failed: {e}")

    if not discovery.selected_for_analysis:
        raise HTTPException(status_code=404, detail="No valid competitor URLs discovered")

    # Step 2: Feed top URLs into existing analysis pipeline
    logger.info(
        "Onboard: analyzing %d URLs from discovery",
        len(discovery.selected_for_analysis),
    )
    analysis = analyze_competitors(
        discovery.selected_for_analysis, request.style_goal
    )

    return OnboardResponse(discovery=discovery, analysis=analysis)
