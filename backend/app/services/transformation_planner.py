"""
Transformation planner — purely deterministic logic that decides
which pages to transform based on evaluation scores.
"""

import logging

from app.schemas.pipeline_v2 import PageEvaluation

logger = logging.getLogger(__name__)


def plan_transformations(
    evaluations: list[PageEvaluation],
    threshold: int = 95,
    max_pages: int = 5,
) -> tuple[list[PageEvaluation], list[PageEvaluation]]:
    """
    Decide which pages need transformation.

    Returns:
        (pages_to_transform, pages_skipped)
        pages_to_transform is sorted worst-first and capped at max_pages.
        pages_skipped are those scoring >= threshold.
    """
    needs_work: list[PageEvaluation] = []
    high_quality: list[PageEvaluation] = []

    for ev in evaluations:
        if ev.score >= threshold:
            high_quality.append(ev)
        else:
            needs_work.append(ev)

    # Sort worst scores first — these get transformed first
    needs_work.sort(key=lambda e: e.score)

    # Cap at max_pages
    to_transform = needs_work[:max_pages]
    overflow = needs_work[max_pages:]

    logger.info(
        "Planner: %d pages need work (transforming top %d), %d high quality, %d overflow skipped",
        len(needs_work), len(to_transform), len(high_quality), len(overflow),
    )

    # Overflow pages are effectively skipped too
    skipped = high_quality + overflow

    return to_transform, skipped
