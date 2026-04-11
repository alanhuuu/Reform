import json
import logging
import os
from urllib.parse import urlparse

import anthropic

from app.prompts.competitor_discovery_prompt import build_discovery_prompt
from app.schemas.discovery import DiscoveredCompetitor, DiscoveryResponse
from app.services.s3_client import list_cached_tinyfish_urls

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


def _normalize_for_cache_match(url: str) -> str:
    """Loose-match key for comparing URLs against the cache list (case-
    insensitive, strip trailing slashes)."""
    return (url or "").strip().lower().rstrip("/")


def _promote_cached(deduped: list[str], limit: int) -> list[str]:
    """Re-rank Claude's top competitors so cache-hit URLs are selected first.

    Only promotes URLs that Claude already surfaced as relevant — we never
    inject a cached URL out of thin air. Cached URLs return in <200ms on
    analysis, so biasing toward them keeps the hackathon fast and cheap.
    """
    try:
        cached_urls = list_cached_tinyfish_urls()
    except Exception as e:
        logger.warning("cache manifest lookup failed, skipping promotion: %s", e)
        return deduped[:limit]

    if not cached_urls:
        return deduped[:limit]

    cached_set = {_normalize_for_cache_match(u) for u in cached_urls}

    cached_hits = [u for u in deduped if _normalize_for_cache_match(u) in cached_set]
    uncached = [u for u in deduped if _normalize_for_cache_match(u) not in cached_set]

    # Consider only the top 2*limit candidates as the promotion pool so a
    # relevance-7 cached URL doesn't beat a relevance-95 uncached one.
    pool_size = max(limit * 2, limit)
    eligible_cached = [u for u in cached_hits if u in deduped[:pool_size]]

    promoted: list[str] = []
    for u in eligible_cached[:limit]:
        promoted.append(u)
    for u in uncached:
        if len(promoted) >= limit:
            break
        promoted.append(u)

    # Fall back in case we somehow ended up empty
    if not promoted:
        return deduped[:limit]

    if promoted != deduped[:limit]:
        logger.info(
            "Cache-aware re-ranking: promoted %d cached URLs → %s",
            len(eligible_cached), promoted,
        )
    return promoted


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

    # Select top N for immediate analysis, preferring URLs we've already
    # cached in S3 so the hackathon audience maximizes cache-hit rate.
    selected = _promote_cached(deduped_urls, ANALYSIS_LIMIT)
    logger.info("Selected top %d for analysis: %s", len(selected), selected)

    return DiscoveryResponse(
        project_category=project_category,
        competitors=competitors,
        deduped_urls=deduped_urls,
        selected_for_analysis=selected,
    )
