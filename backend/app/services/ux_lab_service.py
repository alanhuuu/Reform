"""
UX Lab analysis pipeline.

The full workflow is intentionally staged so the product can run either:
1. analysis-only mode: screenshot + Claude findings
2. full mode: findings + competitor evidence + CSS patches + after preview
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

import anthropic

logger = logging.getLogger(__name__)

_anthropic = anthropic.AsyncAnthropic()
_MODEL = "claude-sonnet-4-20250514"

_PASS1_SYSTEM = """You are a senior UX researcher and conversion specialist with 15+ years of experience auditing high-traffic SaaS and consumer products. You identify UX failures with surgical precision — every finding is traceable to a specific visible element, a specific established principle, and a specific user impact.

Analyze the screenshot and return a JSON array of findings. Maximum 6. Prioritize by conversion impact.

Field requirements — be thorough, not terse:

- "description": 3–4 sentences. Name the element and where it appears on screen. Describe the specific failure observable in the screenshot. Explain the user-facing consequence (e.g. increased cognitive load, reduced click confidence, higher bounce likelihood). Quantify impact where possible.
- "principle": The single most applicable UX/design principle (e.g. Fitts' Law, Hick's Law, Visual Hierarchy, Cognitive Load, Gestalt Proximity, Affordance Theory, Progressive Disclosure, F-pattern, WCAG Contrast).
- "principle_explanation": 2–3 sentences. Explain how the principle applies specifically to this element as observed in the screenshot — not a generic definition. Tie the principle directly to the failure you described.
- "recommendation": 2–3 sentences. Provide a concrete, actionable fix — specific enough for a developer to implement. State the expected measurable outcome (e.g. "reducing decision time", "improving tap accuracy", "increasing CTA visibility").
- "requires_competitor_evidence": Set to true ONLY when the improvement is something a competitor visibly demonstrates in a static screenshot — e.g. better spacing, stronger visual hierarchy, clearer CTA styling, improved layout density, or contrast. Set to false for findings about user flows, multi-step interactions, navigation sequences, onboarding, or any behavior that cannot be seen in a single static image.

Schema:
{
  "id": string,
  "type": "ISSUE" | "WARNING" | "POSITIVE",
  "severity": "critical" | "major" | "minor",
  "component": string (dot-separated path, e.g. "hero.cta", "nav.primary", "pricing.card"),
  "title": string (max 8 words),
  "description": string (3–4 sentences),
  "principle": string,
  "principle_explanation": string (2–3 sentences),
  "recommendation": string (2–3 sentences),
  "requires_competitor_evidence": boolean,
  "annotation": { "x_percent": number, "y_percent": number }
}

Return only the JSON array. No preamble. No markdown fences."""

_PASS2_SYSTEM = """You are a frontend engineer implementing a UX improvement.
Given the issue and the page's current rendered HTML, generate a minimal CSS patch.

Return JSON:
{
  "css_patch": string,
  "patch_description": string,
  "confidence": "high" | "medium" | "low"
}

Return only the JSON object. No preamble. No markdown fences."""


async def _claude_vision(system: str, user_text: str, b64_image: str, media_type: str = "image/png") -> str:
    """Send a vision message to Claude and return the text response."""
    response = await _anthropic.messages.create(
        model=_MODEL,
        max_tokens=8192,
        system=system,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": b64_image,
                        },
                    },
                    {"type": "text", "text": user_text},
                ],
            }
        ],
    )
    return response.content[0].text


async def _claude_text(system: str, user_text: str) -> str:
    """Send a text-only message to Claude and return the text response."""
    response = await _anthropic.messages.create(
        model=_MODEL,
        max_tokens=2048,
        system=system,
        messages=[{"role": "user", "content": user_text}],
    )
    return response.content[0].text


def _crop_to_region(b64_image: str, x_percent: float, y_percent: float, padding: float = 0.15) -> tuple[str, str]:
    """Crop a base64 image to the region around (x_percent, y_percent) with padding.

    Returns (cropped_b64, media_type). Input may be PNG or JPEG; output is always JPEG.
    The crop window is centered on the annotation point and sized to padding*2 of the image
    dimensions on each side, clamped to image bounds.
    """
    import io
    from PIL import Image

    raw = base64.b64decode(b64_image)
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    w, h = img.size

    cx = int(x_percent / 100 * w)
    cy = int(y_percent / 100 * h)
    pad_x = int(padding * w)
    pad_y = int(padding * h)

    left   = max(0, cx - pad_x)
    top    = max(0, cy - pad_y)
    right  = min(w, cx + pad_x)
    bottom = min(h, cy + pad_y)

    cropped = img.crop((left, top, right, bottom))

    buf = io.BytesIO()
    cropped.save(buf, format="JPEG", quality=85, optimize=True)
    return base64.b64encode(buf.getvalue()).decode("utf-8"), "image/jpeg"


def _parse_json_safe(text: str) -> Any:
    """Strip accidental markdown fences and parse JSON."""
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        stripped = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    return json.loads(stripped)


def _normalize_findings(raw_findings: list[dict]) -> list[dict]:
    findings: list[dict] = []
    for raw_finding in raw_findings:
        annotation = raw_finding.get("annotation", {})
        findings.append({
            "id": raw_finding.get("id") or str(uuid.uuid4()),
            "type": raw_finding.get("type", "ISSUE"),
            "severity": raw_finding.get("severity", "minor"),
            "status": "open",
            "component": raw_finding.get("component", "unknown"),
            "title": raw_finding.get("title", "UX Issue"),
            "description": raw_finding.get("description", ""),
            "principle": raw_finding.get("principle", ""),
            "principle_explanation": raw_finding.get("principle_explanation", ""),
            "recommendation": raw_finding.get("recommendation", ""),
            "requires_competitor_evidence": raw_finding.get("requires_competitor_evidence", False),
            "competitor_evidence": [],
            "annotation": {
                "xPercent": annotation.get("x_percent", 50),
                "yPercent": annotation.get("y_percent", 50),
            },
            "css_patch": "",
        })
    return findings


async def capture_before_screenshot(url: str) -> str:
    from app.services.screenshot import take_screenshot_b64

    logger.info("UX Lab: capturing before screenshot for %s", url)
    return await take_screenshot_b64(url)


async def generate_findings(before_b64: str) -> list[dict]:
    logger.info("UX Lab: running Pass 1 analysis")
    raw_findings_text = await _claude_vision(
        system=_PASS1_SYSTEM,
        user_text="Analyze this page screenshot and return the findings JSON array.",
        b64_image=before_b64,
    )

    try:
        raw_findings: list[dict] = _parse_json_safe(raw_findings_text)
    except Exception as exc:
        logger.error("UX Lab: failed to parse Pass 1 output: %s\n%s", exc, raw_findings_text)
        raw_findings = []

    return _normalize_findings(raw_findings)


async def enrich_competitor_evidence(findings: list[dict], competitor_urls: list[str], before_b64: str) -> list[dict]:
    if not competitor_urls:
        return findings

    from app.services.screenshot import take_competitor_screenshot_b64

    logger.info("UX Lab: enriching findings with competitor evidence")
    for finding in findings:
        if not finding.get("requires_competitor_evidence"):
            continue

        annotation = finding.get("annotation", {})
        x_pct = annotation.get("xPercent", 50)
        y_pct = annotation.get("yPercent", 50)

        try:
            our_crop_b64, _ = _crop_to_region(before_b64, x_pct, y_pct)
        except Exception as exc:
            logger.warning("UX Lab: failed to crop before screenshot for finding %s: %s", finding["id"], exc)
            our_crop_b64 = None

        for comp_url in competitor_urls[:3]:
            try:
                comp_b64 = await take_competitor_screenshot_b64(comp_url)
                comp_crop_b64, _ = _crop_to_region(comp_b64, x_pct, y_pct)

                user_content: list[dict] = []
                if our_crop_b64:
                    user_content.append({
                        "type": "image",
                        "source": {"type": "base64", "media_type": "image/jpeg", "data": our_crop_b64},
                    })
                user_content.append({
                    "type": "image",
                    "source": {"type": "base64", "media_type": "image/jpeg", "data": comp_crop_b64},
                })
                prefix = "The first image is the current design. The second image is the competitor. " if our_crop_b64 else ""
                user_content.append({
                    "type": "text",
                    "text": (
                        f"{prefix}Both are cropped to the '{finding['component']}' region. "
                        f"The issue identified: {finding['title']}. "
                        f"In 2-3 sentences, describe what the competitor does differently in this specific area, "
                        f"why it works better visually, and what concrete design decision makes it more effective."
                    ),
                })

                response = await _anthropic.messages.create(
                    model=_MODEL,
                    max_tokens=512,
                    system="You are a senior UX analyst comparing design patterns across products. Be specific about what you see in the images.",
                    messages=[{"role": "user", "content": user_content}],
                )
                note_text = response.content[0].text

                finding["competitor_evidence"].append({
                    "url": comp_url,
                    "screenshot_url": f"data:image/jpeg;base64,{comp_crop_b64}",
                    "annotation": note_text.strip(),
                })
            except Exception as exc:
                logger.warning("UX Lab: competitor screenshot failed for %s: %s", comp_url, exc)

    return findings


async def generate_css_patches(findings: list[dict]) -> tuple[list[dict], list[str]]:
    logger.info("UX Lab: running Pass 2 CSS patch generation")
    css_patches: list[str] = []

    for finding in findings:
        try:
            patch_text = await _claude_text(
                system=_PASS2_SYSTEM,
                user_text=(
                    f"Issue: {finding['title']}\n"
                    f"Component: {finding['component']}\n"
                    f"Recommendation: {finding['recommendation']}\n"
                    f"Generate a minimal CSS patch to implement this improvement."
                ),
            )
            patch_data = _parse_json_safe(patch_text)
            css_patch = patch_data.get("css_patch", "")
            finding["css_patch"] = css_patch
            if css_patch:
                css_patches.append(css_patch)
        except Exception as exc:
            logger.warning("UX Lab: CSS patch failed for finding %s: %s", finding["id"], exc)

    return findings, css_patches


async def render_after_preview(url: str, css_patches: list[str]) -> tuple[str | None, str | None]:
    from app.services.screenshot import take_screenshot_with_css_b64

    combined_css = "\n".join(css_patches)
    if not combined_css.strip():
        return None, "We found UX issues for this page, but no visual preview changes were generated for this run."

    logger.info("UX Lab: capturing after screenshot with %d patches", len(css_patches))
    try:
        after_b64 = await take_screenshot_with_css_b64(url, combined_css)
        return after_b64, None
    except Exception as exc:
        logger.error("UX Lab: after screenshot failed: %s", exc)
        return None, "We found UX issues for this page, but couldn't generate a modified preview screenshot for this run."


async def run_analysis(
    url: str,
    page: str,
    competitor_urls: list[str],
    analysis_only: bool = False,
) -> dict:
    """
    Execute the UX Lab workflow.

    analysis_only mode stops after Pass 1 findings generation so Claude analysis
    can be tested without running competitor enrichment, CSS patching, or after
    preview rendering.
    """
    logger.info(
        "UX Lab: starting %s run for %s (%s)",
        "analysis-only" if analysis_only else "full",
        page,
        url,
    )

    before_b64 = await capture_before_screenshot(url)
    findings = await generate_findings(before_b64)
    findings = await enrich_competitor_evidence(findings, competitor_urls, before_b64)

    if analysis_only:
        return {
            "before_b64": before_b64,
            "after_b64": None,
            "after_message": None,
            "findings": findings,
        }
    findings, css_patches = await generate_css_patches(findings)
    after_b64, after_message = await render_after_preview(url, css_patches)

    return {
        "before_b64": before_b64,
        "after_b64": after_b64,
        "after_message": after_message,
        "findings": findings,
    }
