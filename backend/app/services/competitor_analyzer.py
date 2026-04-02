import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

from app.schemas.competitors import CompetitorAnalysisResponse
from app.services.mock_competitors import MOCK_RESPONSE, mock_site_analysis
from app.services.pattern_aggregator import aggregate_patterns
from app.services.tinyfish_client import extract_site_data

logger = logging.getLogger(__name__)


def analyze_competitors(
    urls: list[str], style_goal: str, backup_urls: list[str] | None = None,
) -> CompetitorAnalysisResponse:
    """Analyze multiple competitor URLs using TinyFish and aggregate results.

    If a URL fails (timeout, captcha, etc.), tries the next backup URL before
    falling back to mock data.
    """
    site_analyses = []
    failed_urls: set[str] = set()
    backups = list(backup_urls or [])

    # Visit each site in parallel using TinyFish
    with ThreadPoolExecutor(max_workers=min(len(urls), 5)) as executor:
        future_to_url = {
            executor.submit(extract_site_data, url): url for url in urls
        }

        for future in as_completed(future_to_url):
            url = future_to_url[future]
            try:
                result = future.result()
                site_analyses.append(result)
                logger.info("Successfully analyzed: %s", url)
            except Exception as e:
                logger.warning("TinyFish failed for %s (%s)", url, e)
                failed_urls.add(url)

    # Retry failed URLs with backups (sequentially — these are fallbacks)
    if failed_urls and backups:
        remaining_backups = [u for u in backups if u not in failed_urls and u not in set(urls)]
        for backup_url in remaining_backups:
            if not failed_urls:
                break
            try:
                logger.info("Retrying with backup URL: %s", backup_url)
                result = extract_site_data(backup_url)
                site_analyses.append(result)
                failed_urls.pop()  # Mark one failure as resolved
                logger.info("Backup succeeded: %s", backup_url)
            except Exception as e:
                logger.warning("Backup also failed for %s (%s)", backup_url, e)

    # Any remaining failures get mock data
    for url in failed_urls:
        logger.warning("Using mock data for %s", url)
        site_analyses.append(mock_site_analysis(url))

    if not site_analyses:
        logger.warning("No sites analyzed, returning full mock response")
        return CompetitorAnalysisResponse(**MOCK_RESPONSE)

    # Aggregate all site analyses into unified patterns
    return aggregate_patterns(site_analyses, style_goal)
