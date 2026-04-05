import logging
import os
import re

import anthropic
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()


class SuggestEditRequest(BaseModel):
    suggestion: str
    current_code: str
    analysis_context: dict | None = None


class SuggestEditResponse(BaseModel):
    revised_code: str
    summary: str


def _extract_code(raw: str) -> str:
    """Extract actual code from Claude's response, stripping any prose preamble."""
    text = raw.strip()

    # Strip markdown fences if present
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:])
        if text.endswith("```"):
            text = text[: text.rfind("```")].strip()

    # If the response starts with code, return it directly
    code_start_patterns = [
        r"^import\s",
        r"^export\s",
        r"^'use client'",
        r'^"use client"',
        r"^const\s",
        r"^function\s",
        r"^class\s",
        r"^/\*",
        r"^//",
    ]
    for pattern in code_start_patterns:
        if re.match(pattern, text):
            return text

    # Claude added prose before the code — find where the code actually starts
    lines = text.split("\n")
    for i, line in enumerate(lines):
        stripped = line.strip()
        for pattern in code_start_patterns:
            if re.match(pattern, stripped):
                extracted = "\n".join(lines[i:])
                logger.warning(
                    "Stripped %d lines of prose preamble from Claude response",
                    i,
                )
                return extracted

    # Last resort: if there's a code fence somewhere in the middle
    fence_match = re.search(r"```(?:tsx?|jsx?|javascript|typescript)?\n(.*?)```", text, re.DOTALL)
    if fence_match:
        logger.warning("Extracted code from embedded markdown fence")
        return fence_match.group(1).strip()

    # Nothing worked — return as-is but log a warning
    logger.error("Could not extract clean code from Claude response (first 100 chars: %s)", text[:100])
    return text


@router.post("/suggest-edit", response_model=SuggestEditResponse)
async def suggest_edit_endpoint(req: SuggestEditRequest):
    """
    Takes a user suggestion prompt and the current generated code,
    sends it to Claude to produce a revised version.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not configured")

    prompt = f"""You are a senior React + Tailwind engineer. The user has a generated UI component and wants to make a specific edit.

## Current Code
{req.current_code}

## User's Requested Edit
{req.suggestion}

## Analysis Context
{req.analysis_context if req.analysis_context else "No additional context."}

---

## Instructions
1. Apply the user's requested edit to the current code.
2. Keep all existing functionality intact unless the edit explicitly changes it.
3. Maintain the same dark theme, Tailwind classes, and code style.
4. Return ONLY the revised code — no explanation, no commentary.
5. Start IMMEDIATELY with the first line of code (import statement or 'use client' directive).
6. Do NOT include markdown fences.
7. Do NOT write any text before or after the code."""

    try:
        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=8192,
            messages=[
                {"role": "user", "content": prompt},
                {"role": "assistant", "content": "import"},
            ],
        )
        # Prepend "import" back since we used it as a prefill
        raw = "import" + message.content[0].text

        revised_code = _extract_code(raw)

        # Sanity check: does it look like valid code?
        if not any(kw in revised_code[:200] for kw in ["import", "export", "function", "const", "'use client'"]):
            logger.error("Revised code doesn't look like valid JSX (first 200 chars: %s)", revised_code[:200])
            raise ValueError("Claude returned prose instead of code")

        # Generate a short summary of the change
        summary_msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=100,
            messages=[
                {
                    "role": "user",
                    "content": f"""Generate a Git commit title for this UI change. RULES: 3-7 words only, no punctuation, no code terms (no className, div, Tailwind, etc.), focus on user-level impact, action-oriented. Examples: "Improve layout spacing consistency", "Fix background height issues", "Enhance CTA visibility". Change: {req.suggestion}""",
                }
            ],
        )
        summary = summary_msg.content[0].text.strip()

        return SuggestEditResponse(revised_code=revised_code, summary=summary)

    except Exception as e:
        logger.error("Suggest edit failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Edit suggestion failed: {e}") from e
