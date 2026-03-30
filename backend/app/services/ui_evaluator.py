"""
UI quality evaluator — uses Claude to score each page's UI quality
across layout, hierarchy, spacing, CTA clarity, components, and density.
"""

import asyncio
import json
import logging
import os

import anthropic

from app.prompts.ui_evaluation_prompt import build_ui_evaluation_prompt
from app.schemas.pipeline_v2 import (
    DiscoveredPage,
    PageEvaluation,
    PageIssue,
    ScoreBreakdown,
)

logger = logging.getLogger(__name__)

# Max concurrent Claude calls for evaluation
MAX_CONCURRENT_EVALUATIONS = 3

# Truncation limits
MAX_PAGE_CHARS = 15_000
MAX_DEPENDENCY_CHARS = 10_000


def _extract_json(text: str) -> dict:
    """Best-effort JSON extraction from Claude response."""
    # Strip markdown fences
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        cleaned = "\n".join(lines[1:])
        if cleaned.endswith("```"):
            cleaned = cleaned[:cleaned.rfind("```")].strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Try extracting JSON object
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            pass

    return {}


def _build_dependency_context(
    page_path: str,
    dependency_files: list[dict],
) -> str:
    """Build truncated dependency code string for the evaluation prompt."""
    if not dependency_files:
        return "No imported dependencies found."

    parts = []
    total = 0
    for dep in dependency_files:
        content = dep["content"]
        remaining = MAX_DEPENDENCY_CHARS - total
        if remaining <= 0:
            break
        if len(content) > remaining:
            content = content[:remaining] + "\n// ... truncated"
        parts.append(f"### {dep['path']}\n```tsx\n{content}\n```")
        total += len(content)

    return "\n\n".join(parts)


def _parse_evaluation(raw: dict, page_path: str, page_name: str) -> PageEvaluation:
    """Parse Claude's JSON response into a PageEvaluation."""
    breakdown_raw = raw.get("breakdown", {})
    breakdown = ScoreBreakdown(
        layout_structure=breakdown_raw.get("layout_structure", 50),
        visual_hierarchy=breakdown_raw.get("visual_hierarchy", 50),
        spacing_consistency=breakdown_raw.get("spacing_consistency", 50),
        cta_clarity=breakdown_raw.get("cta_clarity", 50),
        component_quality=breakdown_raw.get("component_quality", 50),
        information_density=breakdown_raw.get("information_density", 50),
    )

    issues = []
    for issue_raw in raw.get("issues", []):
        issues.append(PageIssue(
            area=issue_raw.get("area", "Unknown"),
            severity=issue_raw.get("severity", "medium"),
            description=issue_raw.get("description", ""),
        ))

    score = raw.get("score", 50)
    verdict = raw.get("verdict", "needs_improvement" if score < 85 else "high_quality")

    return PageEvaluation(
        page_path=page_path,
        page_name=page_name,
        score=score,
        breakdown=breakdown,
        issues=issues,
        verdict=verdict,
        reasoning=raw.get("reasoning", ""),
    )


async def evaluate_page(
    page_path: str,
    page_name: str,
    page_code: str,
    dependency_code: str,
    design_intelligence: dict | None = None,
) -> PageEvaluation:
    """Evaluate a single page's UI quality using Claude."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY not configured")

    # Truncate page code if too large
    if len(page_code) > MAX_PAGE_CHARS:
        page_code = page_code[:MAX_PAGE_CHARS] + "\n// ... truncated for evaluation"

    # Build design context string
    design_context = ""
    if design_intelligence:
        try:
            design_context = json.dumps(design_intelligence, indent=2)[:3000]
        except (TypeError, ValueError):
            pass

    prompt = build_ui_evaluation_prompt(
        page_code=page_code,
        page_path=page_path,
        dependency_code=dependency_code,
        design_context=design_context,
    )

    client = anthropic.Anthropic(api_key=api_key)

    logger.info("Evaluating page: %s (%d chars)", page_path, len(page_code))

    # Run synchronous Claude call in executor to avoid blocking
    loop = asyncio.get_event_loop()
    message = await loop.run_in_executor(
        None,
        lambda: client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        ),
    )

    raw_text = message.content[0].text.strip()
    parsed = _extract_json(raw_text)

    if not parsed:
        logger.warning("Failed to parse evaluation for %s, using default score", page_path)
        return PageEvaluation(
            page_path=page_path,
            page_name=page_name,
            score=50,
            breakdown=ScoreBreakdown(),
            issues=[],
            verdict="needs_improvement",
            reasoning="Evaluation parsing failed — defaulting to needs_improvement.",
        )

    return _parse_evaluation(parsed, page_path, page_name)


async def evaluate_all_pages(
    pages: list[DiscoveredPage],
    files: list[dict],
    dependency_map: dict[str, list[dict]],
    design_intelligence: dict | None = None,
) -> list[PageEvaluation]:
    """Evaluate all discovered pages concurrently with a semaphore."""
    if not pages:
        return []

    # Build content lookup
    content_lookup = {f["path"]: f["content"] for f in files}
    semaphore = asyncio.Semaphore(MAX_CONCURRENT_EVALUATIONS)

    async def _eval_with_semaphore(page: DiscoveredPage) -> PageEvaluation:
        async with semaphore:
            try:
                page_code = content_lookup.get(page.path, "")
                dep_files = dependency_map.get(page.path, [])
                dep_context = _build_dependency_context(page.path, dep_files)

                return await evaluate_page(
                    page_path=page.path,
                    page_name=page.name,
                    page_code=page_code,
                    dependency_code=dep_context,
                    design_intelligence=design_intelligence,
                )
            except Exception as e:
                logger.error("Evaluation failed for %s: %s", page.path, e)
                return PageEvaluation(
                    page_path=page.path,
                    page_name=page.name,
                    score=50,
                    breakdown=ScoreBreakdown(),
                    issues=[],
                    verdict="needs_improvement",
                    reasoning=f"Evaluation error: {e}",
                )

    results = await asyncio.gather(*[_eval_with_semaphore(p) for p in pages])
    return list(results)
