"""
UX Lab analysis pipeline.

Pipeline per session:
1. Screenshot `url` (before).
2. Pass 1 Claude: identify findings with annotation coordinates.
3. For each finding that needs competitor evidence, screenshot competitors.
4. Pass 2 Claude: generate a CSS patch per finding.
5. Apply all patches in Playwright, take after screenshot.
6. Persist session to DB + S3.
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

_PASS1_SYSTEM = """You are a senior UX researcher analyzing a website screenshot.
Identify specific UX issues grounded in established design principles.

Return a JSON array of findings. Maximum 6. Prioritize issues that most impact conversion.
Every issue must be traceable to a specific element and a specific principle.

Each finding:
{
  "id": string,
  "type": "ISSUE" | "WARNING" | "POSITIVE",
  "severity": "critical" | "major" | "minor",
  "component": string,
  "title": string,
  "description": string,
  "principle": string,
  "principle_explanation": string,
  "recommendation": string,
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


async def _claude_vision(system: str, user_text: str, b64_image: str) -> str:
    """Send a vision message to Claude and return the text response."""
    response = await _anthropic.messages.create(
        model=_MODEL,
        max_tokens=4096,
        system=system,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
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


def _parse_json_safe(text: str) -> Any:
    """Strip accidental markdown fences and parse JSON."""
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        stripped = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    return json.loads(stripped)


async def run_analysis(
    url: str,
    page: str,
    competitor_urls: list[str],
) -> dict:
    """
    Execute the full UX Lab pipeline.

    Returns a dict with:
        before_b64, after_b64, findings (list[dict])
    """
    from app.services.screenshot import (
        take_screenshot_b64,
        take_screenshot_with_css_b64,
    )

    # ── Step 1: before screenshot ──────────────────────────────────────
    logger.info("UX Lab: capturing before screenshot for %s", url)
    before_b64 = await take_screenshot_b64(url)

    # ── Step 2: Pass 1 — issue identification ─────────────────────────
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

    # Normalise keys + inject defaults
    findings: list[dict] = []
    for i, rf in enumerate(raw_findings):
        annotation = rf.get("annotation", {})
        findings.append({
            "id": rf.get("id") or str(uuid.uuid4()),
            "type": rf.get("type", "ISSUE"),
            "severity": rf.get("severity", "minor"),
            "status": "open",
            "component": rf.get("component", "unknown"),
            "title": rf.get("title", "UX Issue"),
            "description": rf.get("description", ""),
            "principle": rf.get("principle", ""),
            "principle_explanation": rf.get("principle_explanation", ""),
            "recommendation": rf.get("recommendation", ""),
            "requires_competitor_evidence": rf.get("requires_competitor_evidence", False),
            "competitor_evidence": [],
            "annotation": {
                "xPercent": annotation.get("x_percent", 50),
                "yPercent": annotation.get("y_percent", 50),
            },
            "css_patch": "",
        })

    # ── Step 3: competitor screenshots (where needed) ─────────────────
    if competitor_urls:
        for finding in findings:
            if not finding["requires_competitor_evidence"]:
                continue
            for comp_url in competitor_urls[:3]:  # cap at 3 per finding
                try:
                    comp_b64 = await take_screenshot_b64(comp_url)
                    note_text = await _claude_vision(
                        system="You are a UX analyst.",
                        user_text=(
                            f"In one sentence, describe how this competitor site handles "
                            f"'{finding['component']}' differently from a typical site "
                            f"with the issue: {finding['title']}"
                        ),
                        b64_image=comp_b64,
                    )
                    finding["competitor_evidence"].append({
                        "url": comp_url,
                        "screenshot_url": f"data:image/png;base64,{comp_b64}",
                        "annotation": note_text.strip(),
                    })
                except Exception as exc:
                    logger.warning("UX Lab: competitor screenshot failed for %s: %s", comp_url, exc)

    # ── Step 4: Pass 2 — CSS patches ─────────────────────────────────
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
            css = patch_data.get("css_patch", "")
            finding["css_patch"] = css
            if css:
                css_patches.append(css)
        except Exception as exc:
            logger.warning("UX Lab: CSS patch failed for finding %s: %s", finding["id"], exc)

    # ── Step 5: after screenshot with all patches applied ─────────────
    combined_css = "\n".join(css_patches)
    if combined_css.strip():
        logger.info("UX Lab: capturing after screenshot with %d patches", len(css_patches))
        try:
            after_b64 = await take_screenshot_with_css_b64(url, combined_css)
        except Exception as exc:
            logger.error("UX Lab: after screenshot failed: %s", exc)
            after_b64 = before_b64
    else:
        after_b64 = before_b64

    return {
        "before_b64": before_b64,
        "after_b64": after_b64,
        "findings": findings,
    }
