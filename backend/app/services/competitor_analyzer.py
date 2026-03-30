import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

from app.schemas.competitors import CompetitorAnalysisResponse
from app.services.mock_competitors import MOCK_RESPONSE, mock_site_analysis
from app.services.pattern_aggregator import aggregate_patterns
from app.services.tinyfish_client import extract_site_data

logger = logging.getLogger(__name__)


def analyze_competitors(
    urls: list[str], style_goal: str
) -> CompetitorAnalysisResponse:
    """Analyze multiple competitor URLs using TinyFish and aggregate results."""
    site_analyses = []

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
                logger.warning("TinyFish failed for %s (%s), using mock", url, e)
                site_analyses.append(mock_site_analysis(url))

    if not site_analyses:
        logger.warning("No sites analyzed, returning full mock response")
        return CompetitorAnalysisResponse(**MOCK_RESPONSE)

    # Aggregate all site analyses into unified patterns
    return aggregate_patterns(site_analyses, style_goal)
