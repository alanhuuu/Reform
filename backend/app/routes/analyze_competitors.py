import json
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.schemas.competitors import CompetitorAnalysisResponse, CompetitorRequest
from app.services.competitor_analyzer import analyze_competitors
from app.services.tinyfish_client import EXPECTED_FIELDS, extract_site_data, get_cached
from app.services.mock_competitors import mock_site_analysis
from app.services.pattern_aggregator import aggregate_patterns

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_URLS = 5


@router.post("/analyze-competitors", response_model=CompetitorAnalysisResponse)
async def analyze_competitors_endpoint(request: CompetitorRequest):
    if not request.urls:
        raise HTTPException(status_code=400, detail="At least one URL is required")

    if len(request.urls) > MAX_URLS:
        raise HTTPException(
            status_code=400, detail=f"Maximum {MAX_URLS} URLs allowed per request"
        )

    urls = [str(u) for u in request.urls]
    logger.info("Analyzing %d competitor URLs: %s", len(urls), urls)

    result = analyze_competitors(urls, request.style_goal)
    return result


@router.post("/analyze-competitors-stream")
async def analyze_competitors_stream_endpoint(request: CompetitorRequest):
    """SSE streaming version — sends progress as each site completes."""
    if not request.urls:
        raise HTTPException(status_code=400, detail="At least one URL is required")

    if len(request.urls) > MAX_URLS:
        raise HTTPException(
            status_code=400, detail=f"Maximum {MAX_URLS} URLs allowed per request"
        )

    urls = [str(u) for u in request.urls]

    def event_stream():
        from concurrent.futures import ThreadPoolExecutor, as_completed

        site_analyses = []
        total = len(urls)

        with ThreadPoolExecutor(max_workers=min(total, 5)) as executor:
            future_to_url = {
                executor.submit(extract_site_data, url): url for url in urls
            }
            completed_count = 0

            for future in as_completed(future_to_url):
                url = future_to_url[future]
                completed_count += 1
                try:
                    result = future.result()
                    site_analyses.append(result)
                except Exception as e:
                    logger.warning("TinyFish failed for %s (%s), using mock", url, e)
                    site_analyses.append(mock_site_analysis(url))

                yield f"data: {json.dumps({'event': 'site_complete', 'url': url, 'index': completed_count, 'total': total})}\n\n"

        yield f"data: {json.dumps({'event': 'aggregating'})}\n\n"

        result = aggregate_patterns(site_analyses, request.style_goal)
        yield f"data: {json.dumps({'event': 'complete', 'data': result.model_dump()})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/extract-raw")
async def extract_raw_endpoint(request: CompetitorRequest):
    """TinyFish-only extraction. No Claude. Returns raw TinyFish output per URL."""
    if not request.urls:
        raise HTTPException(status_code=400, detail="At least one URL is required")

    if len(request.urls) > MAX_URLS:
        raise HTTPException(
            status_code=400, detail=f"Maximum {MAX_URLS} URLs allowed per request"
        )

    results = []
    for url in request.urls:
        url_str = str(url)
        try:
            data = extract_site_data(url_str)
            analysis = data["raw_analysis"]
            present = [f for f in EXPECTED_FIELDS if f in analysis]
            missing = [f for f in EXPECTED_FIELDS if f not in analysis]
            results.append({
                "url": url_str,
                "status": "ok",
                "data": analysis,
                "field_coverage": {
                    "present": present,
                    "missing": missing,
                    "coverage": f"{len(present)}/{len(EXPECTED_FIELDS)}",
                },
            })
        except Exception as e:
            results.append({"url": url_str, "status": "error", "error": str(e)})

    return {"results": results}
