import asyncio
import json
import logging
import os
import time

from tinyfish import AsyncTinyFish, RunStatus

from app.prompts.competitor_analysis_prompt import SITE_EXTRACTION_GOAL
from app.services.s3_client import download_tinyfish_cache, upload_tinyfish_cache

logger = logging.getLogger(__name__)

# ─── Concurrency ────────────────────────────────────────────────────────────
# Aligns our client-side backpressure with the TinyFish account concurrency
# limit. Firing more than this just queues silently on TinyFish's end, so the
# semaphore gives us clearer runtime behaviour + makes it easy to bump this
# via env var when the plan tier changes (Starter=10, Pro=higher, etc.).
_CONCURRENCY_LIMIT = int(os.environ.get("TINYFISH_MAX_CONCURRENT", "10"))
_semaphore: asyncio.Semaphore | None = None

# Hard wall-clock ceiling for a single agent.run() call. The SDK-level
# `timeout` on AsyncTinyFish is HTTP-layer — it does not abort a slow end-to-end
# agent run. Without this cap we've seen individual sites take 10+ minutes,
# holding the whole competitor batch hostage. On timeout we fall back to a
# minimal stub so the rest of the analysis still completes.
_PER_RUN_TIMEOUT = float(os.environ.get("TINYFISH_PER_RUN_TIMEOUT", "150"))


def _get_semaphore() -> asyncio.Semaphore:
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(_CONCURRENCY_LIMIT)
    return _semaphore


# ─── Shared AsyncTinyFish client ────────────────────────────────────────────
# Lazily created, reused across all extract_site_data calls so every request
# shares one HTTP connection pool instead of constructing a fresh client per
# URL (saves ~100-300ms of TCP + TLS handshake per call).
_client: AsyncTinyFish | None = None


def _get_client() -> AsyncTinyFish:
    global _client
    if _client is None:
        api_key = os.environ.get("TINYFISH_API_KEY")
        if not api_key:
            raise RuntimeError("TINYFISH_API_KEY environment variable is not set")
        # TinyFish queues internally behind the account concurrency cap, so the
        # wall-clock for a single `agent.run()` can be queue_wait + actual_run.
        # Give it 5 minutes before we give up — the Starter plan's 10-concurrent
        # limit means a 60-URL batch can legitimately take a while per call.
        _client = AsyncTinyFish(api_key=api_key, timeout=300.0)
    return _client

# ─── URL-level cache ────────────────────────────────────────────────────────
# Two-tier: in-memory (fast, per-process) backed by S3 (persistent across
# deploys/restarts). Most competitor sites don't change meaningfully day to
# day, so a long persistent TTL is safe and saves minutes per analysis.
_cache: dict[str, tuple[float, dict]] = {}
CACHE_TTL = 86400              # 24h in-memory
S3_CACHE_MAX_AGE_DAYS = 7      # 7 days for persistent S3 cache


def get_cached(url: str) -> dict | None:
    """Return cached result if any tier has a fresh entry."""
    entry = _cache.get(url)
    if entry and (time.time() - entry[0]) < CACHE_TTL:
        logger.info("Cache HIT (memory) for %s", url)
        return entry[1]

    # Fall back to persistent S3 cache so we survive restarts/deploys.
    s3_entry = download_tinyfish_cache(url, max_age_days=S3_CACHE_MAX_AGE_DAYS)
    if s3_entry:
        logger.info("Cache HIT (s3) for %s", url)
        _cache[url] = (time.time(), s3_entry)
        return s3_entry

    return None


def _set_cache(url: str, data: dict) -> None:
    _cache[url] = (time.time(), data)
    # Fire-and-forget to S3 — failure must not break the live call path.
    try:
        upload_tinyfish_cache(url, data)
    except Exception as e:
        logger.warning("TinyFish S3 cache write failed for %s: %s", url, e)


def clear_cache() -> None:
    """Clear the URL cache. Used in tests."""
    _cache.clear()

# Fields we expect from TinyFish extraction, matching what the aggregator needs
EXPECTED_FIELDS = [
    "page_type", "layout", "visual_style", "components",
    "typography", "design_tokens", "ux_flow", "ux_quality",
    "user_goal", "why_it_works", "problems",
    "cta_analysis", "post_click_experience", "flows",
]

# Required sub-fields for validation
REQUIRED_COLOR_KEYS = [
    "background", "surface", "text_primary", "text_secondary",
    "accent_primary", "border",
]

TYPOGRAPHY_DEFAULTS = {
    "font_family": "Inter, system-ui, sans-serif",
    "font_mono": "JetBrains Mono, monospace",
    "scale": ["12px", "14px", "16px", "20px", "24px", "32px", "48px"],
    "weight_normal": "400",
    "weight_medium": "500",
    "weight_bold": "700",
}

SHADOW_DEFAULTS = {
    "sm": "0 1px 2px rgba(0,0,0,0.05)",
    "md": "0 4px 8px rgba(0,0,0,0.1)",
    "lg": "0 8px 24px rgba(0,0,0,0.15)",
}

BORDER_DEFAULTS = {
    "default": "1px solid rgba(255,255,255,0.1)",
}

MOTION_DEFAULTS = {
    "duration_fast": "150ms",
    "duration_normal": "200ms",
    "easing": "ease-out",
}

CTA_ANALYSIS_DEFAULTS = {
    "primary_cta_label": "unknown",
    "primary_cta_location": "unknown",
    "cta_prominence": "unknown",
    "cta_clarity": "unknown",
    "cta_competition": "unknown",
}

POST_CLICK_DEFAULTS = {
    "destination_type": "unknown",
    "next_step_clarity": "unknown",
    "friction_level": "unknown",
    "notes": "not_explored",
}

VALID_LEVELS = {"high", "medium", "low", "unknown"}


def _get_api_key() -> str:
    api_key = os.environ.get("TINYFISH_API_KEY")
    if not api_key:
        raise RuntimeError("TINYFISH_API_KEY environment variable is not set")
    return api_key


def _ensure_typography(data: dict, url: str) -> None:
    """Ensure typography field is a dict with all required keys."""
    typo = data.get("typography")

    if isinstance(typo, str):
        # Old format was a single string — convert to structured
        logger.warning("TinyFish returned string typography for %s, upgrading", url)
        data["typography"] = {**TYPOGRAPHY_DEFAULTS, "font_family": typo}
        return

    if not isinstance(typo, dict):
        logger.warning("Typography missing for %s, injecting defaults", url)
        data["typography"] = {**TYPOGRAPHY_DEFAULTS}
        return

    # Fill missing keys with defaults
    for key, default in TYPOGRAPHY_DEFAULTS.items():
        if key not in typo:
            logger.warning("Typography.%s missing for %s, using default", key, url)
            typo[key] = default


def _ensure_design_tokens(data: dict, url: str) -> None:
    """Ensure design_tokens has all required sub-structures."""
    tokens = data.get("design_tokens")
    if not isinstance(tokens, dict):
        logger.warning("design_tokens missing for %s, injecting minimal defaults", url)
        data["design_tokens"] = {"theme": "dark", "colors": {}, "density": "comfortable"}
        tokens = data["design_tokens"]

    # Ensure colors has required keys
    colors = tokens.get("colors", {})
    if not isinstance(colors, dict):
        colors = {}
        tokens["colors"] = colors

    missing_colors = [k for k in REQUIRED_COLOR_KEYS if k not in colors]
    if missing_colors:
        logger.warning("design_tokens.colors missing keys for %s: %s", url, missing_colors)

    # Migrate old "accent" key to "accent_primary"
    if "accent" in colors and "accent_primary" not in colors:
        colors["accent_primary"] = colors.pop("accent")

    # Ensure shadow is structured (not a string)
    shadow = tokens.get("shadow")
    if not isinstance(shadow, dict) or not all(k in shadow for k in ("sm", "md", "lg")):
        old = tokens.pop("shadow_style", None) or tokens.pop("shadow", None)
        if old:
            logger.warning("design_tokens.shadow was '%s' for %s, replacing with CSS values", old, url)
        tokens["shadow"] = {**SHADOW_DEFAULTS}

    # Ensure border is structured (not a string)
    border = tokens.get("border")
    if not isinstance(border, dict) or "default" not in border:
        old = tokens.pop("border_style", None) or tokens.pop("border", None)
        if old:
            logger.warning("design_tokens.border was '%s' for %s, replacing with CSS value", old, url)
        tokens["border"] = {**BORDER_DEFAULTS}

    # Ensure motion exists
    motion = tokens.get("motion")
    if not isinstance(motion, dict):
        logger.warning("design_tokens.motion missing for %s, injecting defaults", url)
        tokens["motion"] = {**MOTION_DEFAULTS}


def _normalize_level(value: str) -> str:
    """Normalize a high/medium/low enum value."""
    if isinstance(value, str):
        cleaned = value.strip().lower().replace(" ", "_")
        if cleaned in VALID_LEVELS:
            return cleaned
    return "unknown"


def _ensure_ux_intelligence(data: dict, url: str) -> None:
    """Ensure all 6 UX intelligence fields exist with valid shapes."""

    # user_goal: string
    goal = data.get("user_goal")
    if not isinstance(goal, str) or not goal.strip():
        logger.warning("user_goal missing for %s, using default", url)
        data["user_goal"] = "unknown_primary_goal"

    # why_it_works: list of strings
    wiw = data.get("why_it_works")
    if not isinstance(wiw, list):
        logger.warning("why_it_works missing for %s, using empty list", url)
        data["why_it_works"] = []
    else:
        data["why_it_works"] = [s for s in wiw if isinstance(s, str) and s.strip()]

    # problems: list of strings
    probs = data.get("problems")
    if not isinstance(probs, list):
        logger.warning("problems missing for %s, using empty list", url)
        data["problems"] = []
    else:
        data["problems"] = [s for s in probs if isinstance(s, str) and s.strip()]

    # cta_analysis: structured dict
    cta = data.get("cta_analysis")
    if not isinstance(cta, dict):
        logger.warning("cta_analysis missing for %s, injecting defaults", url)
        data["cta_analysis"] = {**CTA_ANALYSIS_DEFAULTS}
    else:
        for key, default in CTA_ANALYSIS_DEFAULTS.items():
            if key not in cta or not isinstance(cta[key], str):
                cta[key] = default
        # Normalize enum fields
        for enum_key in ("cta_prominence", "cta_clarity", "cta_competition"):
            cta[enum_key] = _normalize_level(cta[enum_key])

    # post_click_experience: structured dict
    pce = data.get("post_click_experience")
    if not isinstance(pce, dict):
        logger.warning("post_click_experience missing for %s, injecting defaults", url)
        data["post_click_experience"] = {**POST_CLICK_DEFAULTS}
    else:
        for key, default in POST_CLICK_DEFAULTS.items():
            if key not in pce or not isinstance(pce[key], str):
                pce[key] = default
        pce["next_step_clarity"] = _normalize_level(pce["next_step_clarity"])
        pce["friction_level"] = _normalize_level(pce["friction_level"])

    # flows: list of flow objects
    flows = data.get("flows")
    if not isinstance(flows, list):
        logger.warning("flows missing for %s, using empty list", url)
        data["flows"] = []
    else:
        cleaned_flows = []
        for f in flows:
            if not isinstance(f, dict):
                continue
            cleaned = {
                "flow_name": f.get("flow_name", "unnamed_flow") if isinstance(f.get("flow_name"), str) else "unnamed_flow",
                "steps": [s for s in f.get("steps", []) if isinstance(s, str)] if isinstance(f.get("steps"), list) else [],
                "clarity": _normalize_level(f.get("clarity", "unknown")),
                "friction": _normalize_level(f.get("friction", "unknown")),
            }
            cleaned_flows.append(cleaned)
        data["flows"] = cleaned_flows


def _normalize(raw: str, url: str) -> dict:
    """Parse TinyFish output into a consistent dict with validated sub-structures."""
    cleaned = raw.strip()

    # Strip markdown fences if present
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

    # Try parsing as JSON
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            logger.info("TinyFish returned structured JSON for %s", url)
            _ensure_typography(parsed, url)
            _ensure_design_tokens(parsed, url)
            _ensure_ux_intelligence(parsed, url)
            return parsed
    except json.JSONDecodeError:
        pass

    # Fall back: wrap raw text in a known structure
    logger.info("TinyFish returned unstructured text for %s, wrapping", url)
    fallback = {"page_type": "unknown", "raw_text": cleaned}
    fallback["typography"] = {**TYPOGRAPHY_DEFAULTS}
    fallback["design_tokens"] = {
        "theme": "dark",
        "colors": {},
        "shadow": {**SHADOW_DEFAULTS},
        "border": {**BORDER_DEFAULTS},
        "motion": {**MOTION_DEFAULTS},
        "density": "comfortable",
    }
    _ensure_ux_intelligence(fallback, url)
    return fallback


async def extract_site_data(url: str) -> dict:
    """Use TinyFish to visit a URL and extract UI/UX design intelligence.

    Async path through `AsyncTinyFish.agent.run()`. A module-level
    semaphore caps in-flight runs at the account concurrency limit so
    we don't flood TinyFish's queue beyond what their quota can serve.
    """
    cached = get_cached(url)
    if cached:
        return cached

    logger.info("TinyFish: navigating to %s", url)
    client = _get_client()

    started = time.monotonic()
    async with _get_semaphore():
        waited_for = time.monotonic() - started
        if waited_for > 0.5:
            logger.info("TinyFish: %s waited %.1fs for a slot", url, waited_for)
        try:
            response = await asyncio.wait_for(
                client.agent.run(
                    url=url,
                    goal=SITE_EXTRACTION_GOAL,
                ),
                timeout=_PER_RUN_TIMEOUT,
            )
        except asyncio.TimeoutError:
            logger.warning(
                "TinyFish: %s exceeded %.0fs wall-clock cap — returning fallback",
                url, _PER_RUN_TIMEOUT,
            )
            fallback = _normalize("", url)
            # Deliberately do NOT cache — next run should get a fresh shot.
            return {"url": url, "raw_analysis": fallback, "timed_out": True}
        except Exception as e:
            # TinyFish SDK errors often have empty str(), so include the
            # class name and repr so the log actually tells us something.
            logger.error(
                "TinyFish call failed for %s: %s: %s",
                url, type(e).__name__, repr(e),
            )
            raise

    if response.status != RunStatus.COMPLETED:
        raise RuntimeError(
            f"TinyFish run did not complete for {url}: "
            f"status={response.status.name} error={response.error}"
        )

    result_data = response.result
    if not result_data:
        raise RuntimeError(f"TinyFish returned no result for {url}")

    # result_data may be a dict (structured) or a string
    if isinstance(result_data, dict):
        raw_text = json.dumps(result_data)
    else:
        raw_text = str(result_data)

    logger.info(
        "TinyFish: %s — %d chars, %d steps",
        url, len(raw_text), response.num_of_steps,
    )

    normalized = _normalize(raw_text, url)

    # Log which expected fields are present vs missing
    present = [f for f in EXPECTED_FIELDS if f in normalized]
    missing = [f for f in EXPECTED_FIELDS if f not in normalized]
    if missing:
        logger.warning("TinyFish output for %s missing fields: %s", url, missing)
    logger.info("TinyFish output for %s has fields: %s", url, present)

    # Validate critical sub-fields
    colors = normalized.get("design_tokens", {}).get("colors", {})
    if "accent_primary" not in colors:
        logger.warning("VALIDATION: accent_primary missing in colors for %s", url)

    typo = normalized.get("typography", {})
    if not isinstance(typo, dict) or "font_family" not in typo:
        logger.warning("VALIDATION: font_family missing in typography for %s", url)

    result = {"url": url, "raw_analysis": normalized}
    _set_cache(url, result)
    return result
