"""Pre-warm the TinyFish URL cache.

Run once tonight so tomorrow's hackathon audience hits cache for the
obvious competitor picks. Fires `extract_site_data` against every URL
in the list; each one populates both the in-memory cache (per-process)
and the S3 cache (persistent across restarts / deploys).

Usage
─────
    cd backend
    python -m app.scripts.prewarm_tinyfish                 # default list
    python -m app.scripts.prewarm_tinyfish url1 url2 ...   # explicit URLs

Environment
───────────
    TINYFISH_API_KEY       required
    TINYFISH_MAX_CONCURRENT  optional (defaults to 10; matches account cap)
    AWS_*                  required for S3 cache writes

The script respects the module-level semaphore inside
`tinyfish_client.extract_site_data`, so it will never fire more than
`TINYFISH_MAX_CONCURRENT` browser sessions at a time regardless of the
batch size.
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
import time

# Make sure the backend/app package is importable when running as a script
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from app.services.tinyfish_client import extract_site_data, get_cached  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("prewarm")

# ── Curated list of likely hackathon picks ──────────────────────────────
# Covers dev tools, dashboards, fintech, AI, SaaS, design tools, infra.
# ~60 URLs — roughly what Reform's discovery Claude tends to surface for
# the obvious categories. Tune this list if you know the attendees are
# building something specific.
DEFAULT_URLS = [
    # Dev infra / platforms
    "https://railway.app",
    "https://vercel.com",
    "https://netlify.com",
    "https://render.com",
    "https://fly.io",
    "https://supabase.com",
    "https://planetscale.com",
    "https://neon.tech",
    "https://upstash.com",
    "https://clerk.com",
    # Dev tools
    "https://linear.app",
    "https://github.com",
    "https://gitlab.com",
    "https://raycast.com",
    "https://warp.dev",
    "https://cursor.com",
    "https://posthog.com",
    "https://sentry.io",
    "https://datadoghq.com",
    "https://retool.com",
    # Design / creative
    "https://figma.com",
    "https://framer.com",
    "https://arc.net",
    "https://notion.so",
    "https://craft.do",
    "https://height.app",
    "https://miro.com",
    # AI / ML
    "https://openai.com",
    "https://anthropic.com",
    "https://replicate.com",
    "https://huggingface.co",
    "https://perplexity.ai",
    "https://cohere.com",
    # Fintech
    "https://stripe.com",
    "https://ramp.com",
    "https://mercury.com",
    "https://plaid.com",
    "https://brex.com",
    "https://wise.com",
    "https://revolut.com",
    # Workflow / productivity
    "https://slack.com",
    "https://zapier.com",
    "https://airtable.com",
    "https://asana.com",
    "https://monday.com",
    "https://clickup.com",
    # SaaS / landing references
    "https://superhuman.com",
    "https://cal.com",
    "https://loom.com",
    "https://pitch.com",
    "https://webflow.com",
    "https://bubble.io",
    # Analytics / data
    "https://amplitude.com",
    "https://mixpanel.com",
    "https://segment.com",
    "https://heap.io",
    # E-commerce
    "https://shopify.com",
    "https://square.com",
    # Misc strong UI examples
    "https://basecamp.com",
    "https://basedash.com",
]


async def _warm_one(url: str, idx: int, total: int) -> tuple[str, str, float]:
    """Return (url, outcome, elapsed_seconds)."""
    started = time.monotonic()
    if get_cached(url):
        elapsed = time.monotonic() - started
        logger.info("[%3d/%d] HIT  %s (%.2fs)", idx, total, url, elapsed)
        return (url, "hit", elapsed)
    try:
        await extract_site_data(url)
        elapsed = time.monotonic() - started
        logger.info("[%3d/%d] WARM %s (%.1fs)", idx, total, url, elapsed)
        return (url, "warmed", elapsed)
    except Exception as e:
        elapsed = time.monotonic() - started
        logger.warning("[%3d/%d] FAIL %s — %s (%.1fs)", idx, total, url, e, elapsed)
        return (url, "failed", elapsed)


async def _run(urls: list[str]) -> None:
    if not os.environ.get("TINYFISH_API_KEY"):
        logger.error("TINYFISH_API_KEY env var is not set — aborting.")
        sys.exit(1)

    concurrency = int(os.environ.get("TINYFISH_MAX_CONCURRENT", "10"))
    logger.info(
        "Pre-warming %d URLs (concurrency cap: %d from TinyFish semaphore)",
        len(urls), concurrency,
    )
    total_started = time.monotonic()

    # The tinyfish_client semaphore does the real concurrency gating; we
    # just fire everything into asyncio and let it run.
    tasks = [
        asyncio.create_task(_warm_one(url, i + 1, len(urls)))
        for i, url in enumerate(urls)
    ]
    results = await asyncio.gather(*tasks)

    total_elapsed = time.monotonic() - total_started
    hits = sum(1 for _, outcome, _ in results if outcome == "hit")
    warmed = sum(1 for _, outcome, _ in results if outcome == "warmed")
    failed = sum(1 for _, outcome, _ in results if outcome == "failed")

    logger.info("─" * 60)
    logger.info("Pre-warm finished in %.1fs", total_elapsed)
    logger.info("  cached already : %d", hits)
    logger.info("  newly warmed   : %d", warmed)
    logger.info("  failed         : %d", failed)
    logger.info("─" * 60)

    if failed:
        logger.warning("Failed URLs:")
        for url, outcome, _ in results:
            if outcome == "failed":
                logger.warning("  - %s", url)


def main() -> None:
    if len(sys.argv) > 1:
        urls = sys.argv[1:]
    else:
        urls = DEFAULT_URLS
    asyncio.run(_run(urls))


if __name__ == "__main__":
    main()
