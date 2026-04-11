"""Parallel competitor analyzer.

Fans out TinyFish runs via `asyncio.gather` and aggregates whatever came
back. The per-call concurrency cap is enforced inside
`tinyfish_client.extract_site_data` via a module-level semaphore, so the
analyzer itself just needs to fire everything and wait.
"""

from __future__ import annotations

import asyncio
import logging

from app.schemas.competitors import CompetitorAnalysisResponse
from app.services.pattern_aggregator import aggregate_patterns
from app.services.tinyfish_client import extract_site_data

logger = logging.getLogger(__name__)

# Wall-clock ceiling for the whole batch of TinyFish runs (including
# queue wait on TinyFish's side). Past this the remaining futures are
# cancelled and we aggregate whatever we have.
BATCH_TIMEOUT_SECONDS = 180


async def _run_one(url: str) -> tuple[str, dict | None]:
    try:
        result = await extract_site_data(url)
        logger.info("Successfully analyzed: %s", url)
        return url, result
    except Exception as e:
        logger.warning("TinyFish failed for %s (%s)", url, e)
        return url, None


async def analyze_competitors(
    urls: list[str],
    style_goal: str,
    backup_urls: list[str] | None = None,
) -> CompetitorAnalysisResponse:
    """Analyze multiple competitor URLs using TinyFish and aggregate results.

    If a URL fails (timeout, captcha, etc.), tries the next backup URL.
    Only real data is used — no mock fallbacks.
    """
    backups = list(backup_urls or [])

    # ── Fire the primary batch concurrently ──
    tasks = [asyncio.create_task(_run_one(url)) for url in urls]
    site_analyses: list[dict] = []
    succeeded_urls: set[str] = set()

    try:
        results = await asyncio.wait_for(
            asyncio.gather(*tasks, return_exceptions=False),
            timeout=BATCH_TIMEOUT_SECONDS,
        )
        for url, result in results:
            if result is not None:
                site_analyses.append(result)
                succeeded_urls.add(url)
    except asyncio.TimeoutError:
        logger.warning(
            "Batch timeout after %ds. Collecting whatever finished.",
            BATCH_TIMEOUT_SECONDS,
        )
        # Harvest any completed tasks; cancel the rest.
        for task in tasks:
            if task.done() and not task.cancelled():
                try:
                    url, result = task.result()
                    if result is not None:
                        site_analyses.append(result)
                        succeeded_urls.add(url)
                except Exception:
                    pass
            else:
                task.cancel()

    failed_urls = [u for u in urls if u not in succeeded_urls]

    # ── Retry failures with backup URLs (sequential — the primary batch
    # already saturated any parallel capacity). ──
    if failed_urls and backups:
        remaining_backups = [
            u for u in backups if u not in set(failed_urls) and u not in set(urls)
        ]
        for backup_url in remaining_backups:
            if not failed_urls:
                break
            try:
                logger.info("Retrying with backup URL: %s", backup_url)
                result = await extract_site_data(backup_url)
                site_analyses.append(result)
                failed_urls.pop(0)
                logger.info("Backup succeeded: %s", backup_url)
            except Exception as e:
                logger.warning("Backup also failed for %s (%s)", backup_url, e)

    # Log any sites we couldn't analyze — no mock data, just skip them
    for url in failed_urls:
        logger.warning("No data for %s — skipping (no mock fallback)", url)

    if not site_analyses:
        raise RuntimeError(
            "All competitor sites failed or timed out. No data to aggregate."
        )

    # aggregate_patterns is a blocking Claude call — offload so we don't
    # block the event loop if a caller (non-streaming /analyze-competitors
    # route) awaits us inside a request handler.
    return await asyncio.to_thread(aggregate_patterns, site_analyses, style_goal)
