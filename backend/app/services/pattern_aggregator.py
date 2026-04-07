import json
import logging
import os

import anthropic

from app.prompts.competitor_analysis_prompt import build_aggregation_prompt
from app.schemas.competitors import CompetitorAnalysisResponse

logger = logging.getLogger(__name__)


def aggregate_patterns(
    site_analyses: list[dict], style_goal: str
) -> CompetitorAnalysisResponse:
    """Synthesize raw TinyFish outputs into unified design intelligence."""
    prompt = build_aggregation_prompt(site_analyses, style_goal)

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")

    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()
    # Strip markdown fences if present
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

    data = json.loads(raw)
    return CompetitorAnalysisResponse(**data)
