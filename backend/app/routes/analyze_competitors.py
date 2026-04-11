import asyncio
import json
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.schemas.competitors import CompetitorAnalysisResponse, CompetitorRequest
from app.services.anthropic_errors import is_anthropic_exception, log_and_classify
from app.services.competitor_analyzer import analyze_competitors
from app.services.tinyfish_client import EXPECTED_FIELDS, extract_site_data
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
    backups = [str(u) for u in request.backup_urls]
    logger.info("Analyzing %d competitor URLs: %s (backups: %d)", len(urls), urls, len(backups))

    try:
        result = analyze_competitors(urls, request.style_goal, backup_urls=backups)
    except Exception as e:
        if is_anthropic_exception(e):
            info = log_and_classify(e)
            raise HTTPException(status_code=info.http_status, detail=info.user_message) from e
        logger.error("analyze-competitors failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Analyze failed: {e}") from e
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
    backups = [str(u) for u in request.backup_urls]

    async def event_stream():
        """Async SSE generator. Runs each blocking TinyFish call on a worker
        thread and pushes completion events onto an asyncio.Queue so the
        frontend receives them the moment each site finishes — not batched
        at the end.
        """
        total = len(urls)
        BATCH_TIMEOUT = 120
        site_analyses: list[dict] = []
        succeeded_urls: set[str] = set()
        queue: asyncio.Queue = asyncio.Queue()

        async def _run(url: str):
            try:
                # extract_site_data is blocking — offload to a worker thread.
                result = await asyncio.to_thread(extract_site_data, url)
                await queue.put(("ok", url, result))
            except Exception as e:
                logger.warning("TinyFish failed for %s (%s)", url, e)
                await queue.put(("failed", url, None))

        tasks = [asyncio.create_task(_run(url)) for url in urls]
        done_count = 0
        deadline = asyncio.get_event_loop().time() + BATCH_TIMEOUT

        while done_count < total:
            remaining = deadline - asyncio.get_event_loop().time()
            if remaining <= 0:
                break
            try:
                status, url, result = await asyncio.wait_for(queue.get(), timeout=remaining)
            except asyncio.TimeoutError:
                break
            done_count += 1
            if status == "ok":
                site_analyses.append(result)
                succeeded_urls.add(url)
            yield f"data: {json.dumps({'event': 'site_complete', 'url': url, 'index': done_count, 'total': total, 'status': status})}\n\n"

        # Any tasks still pending after the batch timeout — mark as timeouts
        # and cancel them so the event loop isn't blocked.
        for task, url in zip(tasks, urls):
            if url not in succeeded_urls and not task.done():
                task.cancel()
                done_count += 1
                yield f"data: {json.dumps({'event': 'site_complete', 'url': url, 'index': done_count, 'total': total, 'status': 'timeout'})}\n\n"

        failed_urls = [u for u in urls if u not in succeeded_urls]

        # Retry failures with backup URLs (sequential, each still streams its event)
        remaining_backups = [u for u in backups if u not in set(urls) and u not in set(failed_urls)]
        for backup_url in remaining_backups:
            if not failed_urls:
                break
            yield f"data: {json.dumps({'event': 'retrying', 'url': backup_url})}\n\n"
            try:
                result = await asyncio.to_thread(extract_site_data, backup_url)
                site_analyses.append(result)
                failed_urls.pop(0)
                yield f"data: {json.dumps({'event': 'site_complete', 'url': backup_url, 'index': total, 'total': total, 'status': 'ok'})}\n\n"
            except Exception:
                continue

        if not site_analyses:
            failed_count = len([u for u in urls if u not in succeeded_urls])
            message = (
                f"All {total} competitor site analyses failed. TinyFish either "
                f"couldn't reach them, was rate-limited, or timed out. Check the "
                f"backend logs for per-site errors (failed={failed_count})."
            )
            logger.error("analyze-competitors-stream: %s", message)
            yield f"data: {json.dumps({'event': 'error', 'kind': 'tinyfish_all_failed', 'message': message})}\n\n"
            return

        yield f"data: {json.dumps({'event': 'aggregating'})}\n\n"

        try:
            result = await asyncio.to_thread(
                aggregate_patterns, site_analyses, request.style_goal
            )
        except Exception as e:
            if is_anthropic_exception(e):
                info = log_and_classify(e)
                yield f"data: {json.dumps({'event': 'error', 'kind': info.kind, 'message': info.user_message})}\n\n"
                return
            logger.error(
                "analyze-competitors-stream: pattern aggregation failed: %s",
                e,
                exc_info=True,
            )
            yield f"data: {json.dumps({'event': 'error', 'kind': 'aggregation_failed', 'message': f'Design intelligence aggregation failed: {e}'})}\n\n"
            return

        yield f"data: {json.dumps({'event': 'complete', 'data': result.model_dump()})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            # Disable proxy/browser buffering so each yielded event reaches
            # the client immediately (Railway/nginx otherwise batches them).
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


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
