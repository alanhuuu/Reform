"""
UX Lab analysis pipeline.

The full workflow is intentionally staged so the product can run either:
1. analysis-only mode: screenshot + Claude findings
2. full mode: findings + CSS patches + after preview
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
            "annotation": {
                "xPercent": annotation.get("x_percent", 50),
                "yPercent": annotation.get("y_percent", 50),
            },
            "css_patch": "",
        })
    return findings


async def capture_before_screenshot(repo_url: str, branch: str, route: str, access_token: str = "") -> str:
    import shutil
    import tempfile

    from app.services.preview_renderer import (
        _clone_repo,
        _find_free_port,
        _find_frontend_root,
        _generate_dummy_env,
        _install_deps,
        _kill_server,
        _start_dev_server,
        _wait_for_server,
    )
    from app.services.screenshot import take_screenshot_b64

    tmp_dir = tempfile.mkdtemp(prefix="reform_uxlab_")
    proc = None
    port = _find_free_port()

    try:
        _clone_repo(repo_url, branch, tmp_dir, access_token)
        frontend_dir = _find_frontend_root(tmp_dir)
        _install_deps(frontend_dir)
        _generate_dummy_env(frontend_dir)
        proc = _start_dev_server(frontend_dir, port)
        if not _wait_for_server(port):
            raise RuntimeError("Dev server failed to start for UX Lab screenshot")
        url = f"http://localhost:{port}{route}"
        logger.info("UX Lab: capturing screenshot for %s", url)
        return await take_screenshot_b64(url)
    finally:
        if proc:
            _kill_server(proc)
        shutil.rmtree(tmp_dir, ignore_errors=True)


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
    repo_url: str,
    branch: str,
    page: str,
    access_token: str = "",
    analysis_only: bool = False,
) -> dict:
    """
    Execute the UX Lab workflow.

    Clones the repo, spins up a local dev server, screenshots the target page,
    then runs Claude analysis on the screenshot.

    analysis_only mode stops after Pass 1 findings generation so Claude analysis
    can be tested without running CSS patching or after preview rendering.
    """
    logger.info(
        "UX Lab: starting %s run for %s @ %s (branch: %s)",
        "analysis-only" if analysis_only else "full",
        page,
        repo_url,
        branch,
    )

    before_b64 = await capture_before_screenshot(repo_url, branch, page, access_token)
    findings = await generate_findings(before_b64)

    if analysis_only:
        return {
            "before_b64": before_b64,
            "after_b64": None,
            "after_message": None,
            "findings": findings,
        }
    findings, _ = await generate_css_patches(findings)
    # After-preview via CSS injection is not supported for the repo-based flow.
    after_b64, after_message = None, "After preview is not available in this mode."

    return {
        "before_b64": before_b64,
        "after_b64": after_b64,
        "after_message": after_message,
        "findings": findings,
    }
