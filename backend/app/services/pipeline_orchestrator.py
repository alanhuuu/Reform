"""
Pipeline orchestrator — chains together ingestion, discovery, evaluation,
planning, transformation, validation, rendering, and aggregation into
a single multi-page transformation pipeline.
"""

import asyncio
import json
import logging
import os

import anthropic

from app.services.code_ingestion import ingest_github_repo
from app.services.page_discovery import discover_pages
from app.services.ui_evaluator import evaluate_all_pages
from app.services.transformation_planner import plan_transformations
from app.services.transform_validator import validate_transformation
from app.services.multi_page_renderer import render_multi_page_previews
from app.prompts.structural_transform_prompt import (
    build_structural_transform_prompt,
    build_transform_system_prompt,
)

logger = logging.getLogger(__name__)

# Maximum retries when a transform is detected as cosmetic-only.
# Total attempts = 1 + MAX_TRANSFORM_RETRIES. Each retry escalates the
# pressure on the model (see structural_transform_prompt.is_retry).
MAX_TRANSFORM_RETRIES = 2


def _extract_json(text: str) -> dict:
    """Best-effort JSON extraction from Claude response."""
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

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            pass

    return {}


def _build_supporting_context(
    target_path: str,
    files: list[dict],
    dependency_map: dict[str, list[dict]],
) -> str:
    """Build formatted supporting files context for the transform prompt.
    Includes direct dependencies + a selection of related files."""
    parts = []
    total_chars = 0
    seen = {target_path}

    # First: direct dependencies of this page
    deps = dependency_map.get(target_path, [])
    for dep in deps:
        if dep["path"] in seen:
            continue
        seen.add(dep["path"])
        content = dep["content"]
        if len(content) > 2000:
            content = content[:2000] + "\n// ... truncated"
        if total_chars + len(content) > 30_000:
            break
        parts.append(f"### {dep['path']}\n```tsx\n{content}\n```")
        total_chars += len(content)

    # Then: other relevant files (layouts, shared components)
    for f in files:
        if f["path"] in seen:
            continue
        # Prioritize layout files and shared components
        is_layout = "layout" in f["path"].lower()
        is_shared = any(k in f["path"].lower() for k in ("component", "shared", "common", "ui/"))
        if not (is_layout or is_shared):
            continue
        seen.add(f["path"])
        content = f["content"]
        if len(content) > 2000:
            content = content[:2000] + "\n// ... truncated"
        if total_chars + len(content) > 30_000:
            break
        parts.append(f"### {f['path']}\n```tsx\n{content}\n```")
        total_chars += len(content)

    return "\n\n".join(parts) if parts else "No supporting files."


async def _transform_single_page(
    page_path: str,
    page_code: str,
    evaluation: dict,
    files: list[dict],
    dependency_map: dict[str, list[dict]],
    design_intelligence: dict,
    user_intent: str,
    api_key: str,
    ux_lab_findings: list[dict] | None = None,
) -> dict:
    """
    Transform a single page with validation and retry logic.

    Returns dict with: updated_code, diff_summary, change_annotations,
    change_summary, retries_used, error.
    """
    import asyncio

    supporting_text = _build_supporting_context(page_path, files, dependency_map)
    client = anthropic.Anthropic(api_key=api_key)
    system_prompt = build_transform_system_prompt()

    last_error = ""
    retries_used = 0
    # Track the best attempt across all retries so we never throw away a
    # genuine improvement just because the model couldn't beat the validator
    # on the last try.
    best_attempt: dict | None = None
    best_score = -1.0

    for attempt in range(1 + MAX_TRANSFORM_RETRIES):
        is_retry = attempt > 0

        prompt = build_structural_transform_prompt(
            target_code=page_code,
            target_path=page_path,
            supporting_files=supporting_text,
            evaluation=evaluation,
            design_intelligence=design_intelligence,
            user_intent=user_intent,
            is_retry=is_retry,
            attempt_number=attempt + 1,
            ux_lab_findings=ux_lab_findings,
        )

        logger.info(
            "Transforming %s (attempt %d/%d, %d chars)",
            page_path, attempt + 1, 1 + MAX_TRANSFORM_RETRIES, len(page_code),
        )

        # Run synchronous Claude call in executor
        loop = asyncio.get_event_loop()
        message = await loop.run_in_executor(
            None,
            lambda: client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=16384,
                system=system_prompt,
                messages=[{"role": "user", "content": prompt}],
            ),
        )

        raw_text = message.content[0].text.strip()
        result = _extract_json(raw_text)

        updated_code = result.get("updated_code", "")
        if not updated_code:
            last_error = "Transformation returned empty code"
            retries_used = attempt
            continue

        # Validate: is this a structural change or just cosmetic?
        validation = validate_transformation(page_code, updated_code)
        logger.info(
            "Validation for %s: structural=%s confidence=%.2f — %s",
            page_path, validation["is_structural"],
            validation["confidence"], validation["reasoning"],
        )

        # Track the best attempt by confidence so we can fall back to it
        # if no attempt fully passes validation. Structural attempts always
        # beat non-structural ones, then break ties by confidence.
        attempt_score = (1.0 if validation["is_structural"] else 0.0) + validation["confidence"]
        if attempt_score > best_score:
            best_score = attempt_score
            best_attempt = {
                "updated_code": updated_code,
                "diff_summary": result.get("diff_summary", "UI layout and structure improved."),
                "change_annotations": result.get("change_annotations", []),
                "change_summary": result.get("change_summary", []),
                "validation": validation,
            }

        # Accept immediately if validation passes
        if validation["is_structural"]:
            return {
                "updated_code": updated_code,
                "diff_summary": result.get("diff_summary", "UI layout and structure improved."),
                "change_annotations": result.get("change_annotations", []),
                "change_summary": result.get("change_summary", []),
                "retries_used": retries_used,
                "error": "",
            }

        # Validation failed — retry if we have budget left
        if attempt < MAX_TRANSFORM_RETRIES:
            logger.warning(
                "Transform of %s was insufficient (confidence=%.2f), retrying with escalation",
                page_path, validation["confidence"],
            )
            retries_used = attempt + 1
            continue

    # All retries exhausted. Two cases:
    #   (a) We have a best_attempt that didn't fully pass — RETURN IT ANYWAY
    #       with an error flag, so the user sees the partial result instead
    #       of having the page silently disappear into "high quality".
    #   (b) Every attempt returned empty code — surface a real error.
    if best_attempt is not None:
        v = best_attempt["validation"]
        logger.warning(
            "Transform of %s never fully passed validation after %d attempts — "
            "returning best attempt anyway (confidence=%.2f). User will see a "
            "weak-transformation banner.",
            page_path, 1 + MAX_TRANSFORM_RETRIES, v["confidence"],
        )
        return {
            "updated_code": best_attempt["updated_code"],
            "diff_summary": best_attempt["diff_summary"],
            "change_annotations": best_attempt["change_annotations"],
            "change_summary": best_attempt["change_summary"],
            "retries_used": MAX_TRANSFORM_RETRIES,
            "error": (
                f"Transformation engine could not produce a dramatically different "
                f"result after {1 + MAX_TRANSFORM_RETRIES} attempts. Showing the best "
                f"attempt — but the change may be subtle. ({v['reasoning']})"
            ),
            "weak_transformation": True,
        }

    return {
        "updated_code": "",
        "diff_summary": "",
        "change_annotations": [],
        "change_summary": [],
        "retries_used": retries_used,
        "error": last_error or "All transform attempts returned empty code.",
    }


async def run_pipeline_v2(
    github_url: str,
    branch: str = "main",
    access_token: str | None = None,
    design_intelligence: dict | None = None,
    user_intent: str = "",
    quality_threshold: int = 95,
    max_pages: int = 5,
    ux_lab_findings: list[dict] | None = None,
) -> dict:
    """
    Full multi-page transformation pipeline.

    Steps:
        1. Ingest repository files
        2. Discover all frontend pages
        3. Evaluate UI quality per page
        4. Plan which pages to transform
        5. Transform selected pages with validation
        6. Render before/after screenshots
        7. Aggregate results

    Returns dict matching TransformRepoV2Response schema.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY not configured")

    pipeline_errors: list[str] = []
    di = design_intelligence or {}

    # ── Step 1: Ingest ──────────────────────────────────────────────
    logger.info("Pipeline v2: Ingesting %s (branch: %s)", github_url, branch)
    repo_data = await ingest_github_repo(github_url, branch, access_token)
    files = repo_data["files"]
    file_tree = repo_data["file_tree"]
    repo_name = repo_data["repo_name"]

    if not files:
        raise ValueError("No frontend files found in repository.")

    # ── Step 2: Discover pages ──────────────────────────────────────
    logger.info("Pipeline v2: Discovering pages")
    pages, framework, dependency_map = discover_pages(files, file_tree)

    if not pages:
        raise ValueError(
            "No pages detected. This repo may not use a traditional pages "
            "structure. Falling back to single-page analysis."
        )

    logger.info("Pipeline v2: Found %d pages (%s)", len(pages), framework)

    # ── Step 3: Evaluate all pages ──────────────────────────────────
    logger.info("Pipeline v2: Evaluating %d pages", len(pages))
    evaluations = await evaluate_all_pages(pages, files, dependency_map, di)

    for ev in evaluations:
        logger.info(
            "  %s: score=%d verdict=%s", ev.page_path, ev.score, ev.verdict,
        )

    # ── Step 4: Plan transformations ────────────────────────────────
    to_transform, high_quality, overflow = plan_transformations(
        evaluations, threshold=quality_threshold, max_pages=max_pages,
    )

    logger.info(
        "Pipeline v2: %d pages to transform, %d high-quality, %d overflow",
        len(to_transform), len(high_quality), len(overflow),
    )

    # ── Step 5: Transform selected pages (in parallel) ──────────────
    content_lookup = {f["path"]: f["content"] for f in files}
    transform_results: dict[str, dict] = {}

    async def _run_one(ev) -> tuple[str, dict]:
        page_code = content_lookup.get(ev.page_path, "")
        if not page_code:
            return ev.page_path, {
                "updated_code": "", "diff_summary": "", "change_annotations": [],
                "change_summary": [], "retries_used": 0,
                "error": f"No content found for {ev.page_path}",
            }
        eval_dict = {
            "score": ev.score,
            "breakdown": ev.breakdown.model_dump() if ev.breakdown else {},
            "issues": [i.model_dump() for i in ev.issues],
            "reasoning": ev.reasoning,
        }
        try:
            result = await _transform_single_page(
                page_path=ev.page_path,
                page_code=page_code,
                evaluation=eval_dict,
                files=files,
                dependency_map=dependency_map,
                design_intelligence=di,
                user_intent=user_intent,
                api_key=api_key,
                ux_lab_findings=ux_lab_findings,
            )
            return ev.page_path, result
        except Exception as e:
            logger.error("Transform failed for %s: %s", ev.page_path, e, exc_info=True)
            return ev.page_path, {
                "updated_code": "", "diff_summary": "", "change_annotations": [],
                "change_summary": [], "retries_used": 0, "error": str(e),
            }

    logger.info("Pipeline v2: Transforming %d pages in parallel", len(to_transform))
    results = await asyncio.gather(*[_run_one(ev) for ev in to_transform])
    for path, result in results:
        transform_results[path] = result
        if result.get("error") and not result.get("updated_code"):
            pipeline_errors.append(f"Transform failed for {path}: {result['error']}")

    # ── Step 6: Render screenshots ──────────────────────────────────
    # Build list of successful transforms for screenshotting
    screenshot_transforms = []
    eval_lookup = {ev.page_path: ev for ev in to_transform}
    page_lookup = {p.path: p for p in pages}

    for page_path, result in transform_results.items():
        if result["updated_code"]:
            page = page_lookup.get(page_path)
            screenshot_transforms.append({
                "path": page_path,
                "route": page.route if page else "/",
                "updated_code": result["updated_code"],
            })

    screenshot_results: dict[str, dict] = {}
    if screenshot_transforms:
        repo_clone_url = f"https://github.com/{repo_name}.git"
        try:
            logger.info(
                "Pipeline v2: Rendering screenshots for %d pages",
                len(screenshot_transforms),
            )
            screenshot_results = await render_multi_page_previews(
                repo_clone_url=repo_clone_url,
                branch=branch,
                transforms=screenshot_transforms,
                access_token=access_token or "",
                max_screenshots=len(screenshot_transforms),
            )
        except Exception as e:
            logger.error("Screenshot rendering failed: %s", e, exc_info=True)
            pipeline_errors.append(f"Screenshot rendering failed: {e}")

    # Log screenshot results for debugging
    for path, sdata in screenshot_results.items():
        has_before = bool(sdata.get("before_screenshot"))
        has_after = bool(sdata.get("after_screenshot"))
        perr = sdata.get("preview_error", "")
        logger.info("Screenshots for %s: before=%s after=%s error=%s", path, has_before, has_after, perr or "none")

    # ── Step 7: Aggregate results ───────────────────────────────────
    page_results = []

    # Add transformed pages
    for ev in to_transform:
        result = transform_results.get(ev.page_path, {})
        screenshots = screenshot_results.get(ev.page_path, {})
        page = page_lookup.get(ev.page_path)

        has_code = bool(result.get("updated_code"))
        is_weak = result.get("weak_transformation", False)

        if has_code and is_weak:
            # Weak transformation: still has code, but the engine warns the
            # change isn't dramatic. Show it to the user with a banner — never
            # silently demote to "high_quality".
            status = "weak"
        elif has_code:
            status = "transformed"
        else:
            status = "error"

        page_results.append({
            "page_path": ev.page_path,
            "page_name": ev.page_name,
            "route": page.route if page else "/",
            "status": status,
            "score": ev.score,
            "breakdown": ev.breakdown.model_dump() if ev.breakdown else {},
            "reasoning": ev.reasoning,
            "issues": [i.model_dump() for i in ev.issues],
            "original_code": content_lookup.get(ev.page_path, ""),
            "updated_code": result.get("updated_code", ""),
            "diff_summary": result.get("diff_summary", ""),
            "change_annotations": result.get("change_annotations", []),
            "change_summary": result.get("change_summary", []),
            "before_screenshot": screenshots.get("before_screenshot", ""),
            "after_screenshot": screenshots.get("after_screenshot", ""),
            "error": result.get("error", "") or screenshots.get("preview_error", ""),
            "retries_used": result.get("retries_used", 0),
        })

    # Add high-quality (genuinely good) pages
    for ev in high_quality:
        page = page_lookup.get(ev.page_path)
        page_results.append({
            "page_path": ev.page_path,
            "page_name": ev.page_name,
            "route": page.route if page else "/",
            "status": "high_quality",
            "score": ev.score,
            "breakdown": ev.breakdown.model_dump() if ev.breakdown else {},
            "reasoning": ev.reasoning,
            "issues": [i.model_dump() for i in ev.issues],
            "diff_summary": f"Page scored {ev.score}/100 — no transformation needed.",
        })

    # Add overflow pages — below threshold but skipped due to max_pages cap
    for ev in overflow:
        page = page_lookup.get(ev.page_path)
        page_results.append({
            "page_path": ev.page_path,
            "page_name": ev.page_name,
            "route": page.route if page else "/",
            "status": "skipped_overflow",
            "score": ev.score,
            "breakdown": ev.breakdown.model_dump() if ev.breakdown else {},
            "reasoning": ev.reasoning,
            "issues": [i.model_dump() for i in ev.issues],
            "diff_summary": (
                f"Page scored {ev.score}/100 — needs work but skipped because "
                f"the per-run page cap was reached. Re-run to process it."
            ),
        })

    # Sort results: transformed first, then weak, then errors, then high-quality, then overflow
    def _sort_key(p):
        bucket = {
            "transformed": 0,
            "weak": 0,
            "error": 0,
            "high_quality": 1,
            "skipped_overflow": 2,
        }.get(p["status"], 3)
        return (bucket, p["score"])
    page_results.sort(key=_sort_key)

    # Build global summary
    total_transformed = sum(1 for p in page_results if p["status"] == "transformed")
    total_weak = sum(1 for p in page_results if p["status"] == "weak")
    total_skipped = sum(1 for p in page_results if p["status"] == "high_quality")
    total_overflow = sum(1 for p in page_results if p["status"] == "skipped_overflow")
    total_errors = sum(1 for p in page_results if p["status"] == "error")

    global_summary = [
        f"Evaluated {len(evaluations)} pages across the repository.",
        f"Transformed {total_transformed} page(s), "
        f"skipped {total_skipped} high-quality page(s).",
    ]

    if total_weak:
        global_summary.append(
            f"{total_weak} page(s) received only a weak transformation — "
            f"the engine could not produce a dramatic restructure. Re-running may help."
        )
    if total_overflow:
        global_summary.append(
            f"{total_overflow} page(s) need work but were deferred — re-run to process them."
        )
    if total_errors:
        global_summary.append(f"{total_errors} page(s) encountered errors during transformation.")

    for p in page_results:
        if p["status"] == "transformed" and p.get("diff_summary"):
            global_summary.append(f"{p['page_name']}: {p['diff_summary']}")

    return {
        "repo_name": repo_name,
        "branch": branch,
        "framework": framework,
        "total_pages_found": len(pages),
        "total_evaluated": len(evaluations),
        "total_transformed": total_transformed,
        "total_skipped": total_skipped,
        "pages": page_results,
        "global_summary": global_summary,
        "pipeline_errors": pipeline_errors,
    }
