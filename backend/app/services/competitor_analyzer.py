import logging
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError

from app.schemas.competitors import CompetitorAnalysisResponse
from app.services.pattern_aggregator import aggregate_patterns
from app.services.tinyfish_client import extract_site_data

logger = logging.getLogger(__name__)

# Total wall-clock timeout for the entire parallel batch
BATCH_TIMEOUT_SECONDS = 120


def analyze_competitors(
    urls: list[str], style_goal: str, backup_urls: list[str] | None = None,
) -> CompetitorAnalysisResponse:
    """Analyze multiple competitor URLs using TinyFish and aggregate results.

    If a URL fails (timeout, captcha, etc.), tries the next backup URL.
    Only real data is used — no mock fallbacks.
    """
    site_analyses = []
    succeeded_urls: set[str] = set()
    backups = list(backup_urls or [])

    # Visit each site in parallel using TinyFish.
    # NOTE: we intentionally do NOT use `with ThreadPoolExecutor(...)` — its
    # __exit__ calls shutdown(wait=True), which would block until in-flight
    # TinyFish SSE requests finish, defeating the batch timeout. Instead we
    # manage the executor manually and shutdown(wait=False) on timeout so
    # unfinished threads are abandoned (they'll die when httpx returns).
    executor = ThreadPoolExecutor(max_workers=min(len(urls), 5))
    future_to_url = {
        executor.submit(extract_site_data, url): url for url in urls
    }
    timed_out = False

    try:
        for future in as_completed(future_to_url, timeout=BATCH_TIMEOUT_SECONDS):
            url = future_to_url[future]
            try:
                result = future.result(timeout=10)
                site_analyses.append(result)
                succeeded_urls.add(url)
                logger.info("Successfully analyzed: %s", url)
            except TimeoutError:
                logger.warning("TinyFish result timeout for %s", url)
            except Exception as e:
                logger.warning("TinyFish failed for %s (%s)", url, e)
    except TimeoutError:
        timed_out = True
        unfinished = [u for u in urls if u not in succeeded_urls]
        logger.warning(
            "Batch timeout after %ds. Abandoning: %s",
            BATCH_TIMEOUT_SECONDS, unfinished,
        )
    finally:
        # wait=False so we don't block on in-flight TinyFish calls.
        # cancel_futures=True drops anything not yet started.
        executor.shutdown(wait=not timed_out, cancel_futures=True)

    failed_urls = [u for u in urls if u not in succeeded_urls]

    # Retry failed URLs with backups (sequentially)
    if failed_urls and backups:
        remaining_backups = [u for u in backups if u not in set(failed_urls) and u not in set(urls)]
        for backup_url in remaining_backups:
            if not failed_urls:
                break
            try:
                logger.info("Retrying with backup URL: %s", backup_url)
                result = extract_site_data(backup_url)
                site_analyses.append(result)
                failed_urls.pop(0)
                logger.info("Backup succeeded: %s", backup_url)
            except Exception as e:
                logger.warning("Backup also failed for %s (%s)", backup_url, e)

    # Log any sites we couldn't analyze — no mock data, just skip them
    for url in failed_urls:
        logger.warning("No data for %s — skipping (no mock fallback)", url)

    if not site_analyses:
        raise RuntimeError("All competitor sites failed or timed out. No data to aggregate.")

    # Aggregate whatever real data we got
    return aggregate_patterns(site_analyses, style_goal)
