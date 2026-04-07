import json
import logging
import os
from urllib.parse import urlparse

import anthropic

from app.prompts.competitor_discovery_prompt import build_discovery_prompt
from app.schemas.discovery import DiscoveredCompetitor, DiscoveryResponse

logger = logging.getLogger(__name__)

# Domains that are never valid competitor URLs
BLOCKED_DOMAINS = {
    "producthunt.com", "g2.com", "capterra.com", "trustpilot.com",
    "crunchbase.com", "linkedin.com", "twitter.com", "x.com",
    "facebook.com", "instagram.com", "youtube.com", "tiktok.com",
    "reddit.com", "medium.com", "substack.com", "wikipedia.org",
    "play.google.com", "apps.apple.com", "chrome.google.com",
}

# How many top URLs to select for immediate analysis
ANALYSIS_LIMIT = 3


def _validate_url(url: str) -> str | None:
    """Validate and normalize a URL. Returns cleaned URL or None."""
    url = url.strip()
    if not url.startswith("http"):
        url = "https://" + url

    try:
        parsed = urlparse(url)
        if not parsed.scheme or not parsed.netloc:
            return None

        domain = parsed.netloc.lower().removeprefix("www.")

        if domain in BLOCKED_DOMAINS:
            logger.info("Filtered blocked domain: %s", domain)
            return None

        # Reconstruct clean URL (scheme + netloc only for homepage)
        return f"{parsed.scheme}://{parsed.netloc}"
    except Exception:
        return None


def _deduplicate(competitors: list[DiscoveredCompetitor]) -> list[str]:
    """Deduplicate URLs, keeping the first occurrence (highest relevance since sorted)."""
    seen = set()
    deduped = []
    for c in competitors:
        cleaned = _validate_url(c.url)
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            deduped.append(cleaned)
    return deduped


def discover_competitors(project_description: str) -> DiscoveryResponse:
    """Use Anthropic to discover competitors from a project description."""
    logger.info("Discovering competitors for: %s", project_description[:80])

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY environment variable is not set")

    client = anthropic.Anthropic(api_key=api_key)
    prompt = build_discovery_prompt(project_description)

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=8192,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()

    # Strip markdown fences if present
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

    data = json.loads(raw)

    project_category = data.get("project_category", "unknown")
    raw_competitors = data.get("competitors", [])

    # Parse and validate each competitor
    competitors = []
    for item in raw_competitors:
        url = _validate_url(item.get("url", ""))
        if not url:
            continue
        competitors.append(DiscoveredCompetitor(
            name=item.get("name", "Unknown"),
            url=url,
            reason=item.get("reason", ""),
            relevance=min(max(float(item.get("relevance", 0.5)), 0.0), 1.0),
        ))

    # Sort by relevance descending
    competitors.sort(key=lambda c: c.relevance, reverse=True)

    logger.info(
        "Discovered %d competitors in category '%s'",
        len(competitors), project_category,
    )

    # Deduplicate URLs
    deduped_urls = _deduplicate(competitors)
    logger.info("After dedup: %d unique URLs", len(deduped_urls))

    # Select top N for immediate analysis
    selected = deduped_urls[:ANALYSIS_LIMIT]
    logger.info("Selected top %d for analysis: %s", len(selected), selected)

    return DiscoveryResponse(
        project_category=project_category,
        competitors=competitors,
        deduped_urls=deduped_urls,
        selected_for_analysis=selected,
    )
