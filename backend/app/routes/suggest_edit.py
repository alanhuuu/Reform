import logging
import os
import re

import anthropic
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.anthropic_errors import is_anthropic_exception, log_and_classify

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
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not configured")

    prompt = f"""You are a senior frontend engineer. The user has UI code and wants a specific modification applied.

## Current Code
{req.current_code}

## User's Requested Change
"{req.suggestion}"

---

## CRITICAL RULES
1. You MUST apply the exact change the user requested. This is not optional.
2. If the user says "change purple to blue" — find EVERY purple/violet color value and replace it with blue equivalents.
3. If the user says "make the background darker" — change background color values.
4. If the user says "increase spacing" — increase padding/margin/gap values.
5. The change MUST be visible. If someone compares the before and after code, the difference must be obvious.
6. Preserve all functionality, imports, exports, hooks, state, and event handlers.
7. Return the COMPLETE file with the change applied — not a partial snippet.
8. Return ONLY code — no explanation, no markdown fences, no commentary.
9. Start with the first line of the original code (import or 'use client').

## COMMON MISTAKES TO AVOID
- Do NOT return the code unchanged. The user asked for a specific edit — apply it.
- Do NOT explain what you would change — just change it.
- Do NOT add markdown fences around the code.
- Do NOT skip colors in nested components — change ALL instances.
- If changing colors: also update hover states, borders, shadows, gradients that use the old color.
- If the code uses Tailwind classes like bg-purple-500, change to bg-blue-500 (or whatever the user asked for).
- If the code uses hex values like #7c3aed, change to the appropriate new hex value.
- If the code uses rgba with purple tones, change those too."""

    try:
        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=16384,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text.strip()

        revised_code = _extract_code(raw)

        # Sanity check: does it look like valid code?
        if not any(kw in revised_code[:300] for kw in ["import", "export", "function", "const", "'use client'", "<!DOCTYPE"]):
            logger.error("Revised code doesn't look like valid JSX (first 200 chars: %s)", revised_code[:200])
            raise ValueError("Claude returned prose instead of code")

        # Sanity check: did the code actually change?
        if revised_code.strip() == req.current_code.strip():
            logger.warning("Suggest-edit returned identical code — retrying with stronger prompt")
            retry_msg = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=16384,
                messages=[
                    {"role": "user", "content": prompt},
                    {"role": "user", "content": f"Your previous response was IDENTICAL to the original code. You did NOT apply the change. The user specifically asked: \"{req.suggestion}\". Apply this change NOW. Return the modified code."},
                ],
            )
            raw2 = retry_msg.content[0].text.strip()
            revised_code = _extract_code(raw2)

        # Generate a short summary of the change
        summary_msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=100,
            messages=[
                {
                    "role": "user",
                    "content": f"""Generate a Git commit title for this UI change. RULES: 3-7 words only, no punctuation, no code terms, focus on user-level impact. Change: {req.suggestion}""",
                }
            ],
        )
        summary = summary_msg.content[0].text.strip()

        return SuggestEditResponse(revised_code=revised_code, summary=summary)

    except Exception as e:
        if is_anthropic_exception(e):
            info = log_and_classify(e)
            raise HTTPException(status_code=info.http_status, detail=info.user_message) from e
        logger.error("Suggest edit failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Edit suggestion failed: {e}") from e
