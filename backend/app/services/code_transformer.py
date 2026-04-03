import json
import logging
import os

import anthropic

from app.prompts.code_transform_prompt import build_code_transform_prompt
from app.services.preview_renderer import render_previews

logger = logging.getLogger(__name__)


async def transform_code(
    files: list[dict], target_file: str,
    design_intelligence: dict, user_intent: str = "",
    repo_clone_url: str = "", branch: str = "main",
    access_token: str = "",
) -> dict:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY not configured")

    target = None
    supporting = []
    for f in files:
        if f["path"] == target_file:
            target = f
        else:
            supporting.append(f)
    if not target:
        raise ValueError(f"Target file not found: {target_file}")

    # Cap target file to avoid very slow Claude calls on huge files
    if len(target["content"]) > 30000:
        logger.warning("Target file %s is %d chars, truncating to 30000", target_file, len(target["content"]))
        target = {**target, "content": target["content"][:30000] + "\n// ... truncated for transform (original file too large)"}

    supporting_parts = []
    total_chars = 0
    for sf in supporting:
        content = sf["content"]
        if total_chars + len(content) > 30_000:
            if len(content) > 2000:
                content = content[:2000] + "\n// ... truncated"
        total_chars += len(content)
        supporting_parts.append(f"### {sf['path']}\n```tsx\n{content}\n```")
    supporting_text = "\n\n".join(supporting_parts) if supporting_parts else "No supporting files."

    prompt = build_code_transform_prompt(
        target_code=target["content"], target_path=target_file,
        supporting_files=supporting_text, design_intelligence=design_intelligence,
        user_intent=user_intent,
    )

    client = anthropic.Anthropic(api_key=api_key)
    logger.info("Transforming %s (%d chars)", target_file, len(target["content"]))

    message = client.messages.create(
        model="claude-sonnet-4-6", max_tokens=16384,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:])
        if raw.endswith("```"):
            raw = raw[: raw.rfind("```")].strip()

    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        logger.error("Failed to parse transform response, extracting JSON")
        result = _extract_json(raw)

    updated_code = result.get("updated_code", "")
    if not updated_code:
        raise ValueError("Transformation returned empty code")

    # ── Real preview: clone repo, run dev server, screenshot BEFORE & AFTER ──
    preview = await render_previews(
        repo_clone_url=repo_clone_url,
        branch=branch,
        target_file=target_file,
        updated_code=updated_code,
        access_token=access_token,
    )

    return {
        "transformed_files": [{
            "path": target_file, "original_code": target["content"],
            "updated_code": updated_code,
            "diff_summary": result.get("diff_summary", "Code refactored based on design intelligence."),
        }],
        "change_annotations": result.get("change_annotations", []),
        "change_summary": result.get("change_summary", []),
        "before_screenshot": preview["before_screenshot"],
        "after_screenshot": preview["after_screenshot"],
        "preview_route": preview["preview_route"],
        "preview_error": preview["preview_error"],
    }


def _extract_json(text: str) -> dict:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        return {"updated_code": text, "diff_summary": "Raw output", "change_annotations": [], "change_summary": []}
    try:
        return json.loads(text[start: end + 1])
    except json.JSONDecodeError:
        return {"updated_code": text, "diff_summary": "Raw output", "change_annotations": [], "change_summary": []}
