"""
Transform validator — heuristic-based detection of cosmetic-only changes.
Determines if a transformation made meaningful structural changes
or just tweaked styles/classes.
"""

import re
import logging

logger = logging.getLogger(__name__)


def _strip_styling(code: str) -> str:
    """Remove all className, style, and Tailwind-related attributes from JSX code.
    What remains is the structural skeleton."""
    # Remove className="..." and className={'...'}
    stripped = re.sub(r'\bclassName\s*=\s*"[^"]*"', '', code)
    stripped = re.sub(r'\bclassName\s*=\s*\{[^}]*\}', '', stripped)
    # Remove style={{...}} (including nested braces up to 2 levels)
    stripped = re.sub(r'\bstyle\s*=\s*\{\{[^}]*(?:\{[^}]*\}[^}]*)?\}\}', '', stripped)
    # Remove style={...}
    stripped = re.sub(r'\bstyle\s*=\s*\{[^}]*\}', '', stripped)
    # Collapse whitespace
    stripped = re.sub(r'\s+', ' ', stripped).strip()
    return stripped


def _extract_tag_sequence(code: str) -> list[str]:
    """Extract the sequence of JSX/HTML opening tags from the code.
    This represents the structural skeleton of the component."""
    # Match opening tags like <div, <section, <Header, <button, etc.
    tags = re.findall(r'<(\w+)[\s/>]', code)
    return tags


def _count_meaningful_line_changes(original: str, transformed: str) -> int:
    """Count lines that changed in a meaningful way (not just whitespace or className)."""
    orig_lines = original.splitlines()
    trans_lines = transformed.splitlines()

    # Normalize: strip whitespace and className/style for comparison
    def normalize_line(line: str) -> str:
        line = line.strip()
        line = re.sub(r'\bclassName\s*=\s*"[^"]*"', '', line)
        line = re.sub(r'\bclassName\s*=\s*\{[^}]*\}', '', line)
        line = re.sub(r'\bstyle\s*=\s*\{\{[^}]*(?:\{[^}]*\}[^}]*)?\}\}', '', line)
        line = re.sub(r'\bstyle\s*=\s*\{[^}]*\}', '', line)
        return line.strip()

    # Build normalized sets
    orig_normalized = set()
    for line in orig_lines:
        n = normalize_line(line)
        if n:
            orig_normalized.add(n)

    changed = 0
    for line in trans_lines:
        n = normalize_line(line)
        if n and n not in orig_normalized:
            changed += 1

    return changed


def validate_transformation(original_code: str, transformed_code: str) -> dict:
    """
    Determine if a transformation made structural changes or just cosmetic tweaks.

    Returns:
        {
            "is_structural": bool,
            "confidence": float (0-1),
            "reasoning": str
        }
    """
    # Edge case: identical code
    if original_code.strip() == transformed_code.strip():
        return {
            "is_structural": False,
            "confidence": 1.0,
            "reasoning": "Transformed code is identical to original.",
        }

    # Test 1: Strip all styling and compare structural skeletons
    orig_stripped = _strip_styling(original_code)
    trans_stripped = _strip_styling(transformed_code)

    skeletons_identical = orig_stripped == trans_stripped

    # Test 2: Compare tag sequences
    orig_tags = _extract_tag_sequence(original_code)
    trans_tags = _extract_tag_sequence(transformed_code)

    tags_identical = orig_tags == trans_tags

    # Count new/removed tags
    orig_tag_counts: dict[str, int] = {}
    for t in orig_tags:
        orig_tag_counts[t] = orig_tag_counts.get(t, 0) + 1
    trans_tag_counts: dict[str, int] = {}
    for t in trans_tags:
        trans_tag_counts[t] = trans_tag_counts.get(t, 0) + 1

    new_tags = sum(
        max(0, trans_tag_counts.get(t, 0) - orig_tag_counts.get(t, 0))
        for t in set(list(trans_tag_counts.keys()) + list(orig_tag_counts.keys()))
    )
    removed_tags = sum(
        max(0, orig_tag_counts.get(t, 0) - trans_tag_counts.get(t, 0))
        for t in set(list(trans_tag_counts.keys()) + list(orig_tag_counts.keys()))
    )

    tag_changes = new_tags + removed_tags

    # Test 3: Count meaningful line changes (beyond className/style)
    meaningful_changes = _count_meaningful_line_changes(original_code, transformed_code)

    # Scale thresholds with original page size — a 50-line page can't have
    # 30 tag changes, but a 500-line page should easily exceed it.
    orig_tag_count = max(len(orig_tags), 1)
    # Require restructuring of at least ~25% of the original tag count, with
    # an absolute floor of 12 tag changes for tiny pages and a ceiling check
    # so very large pages still need substantive change.
    required_tag_changes = max(12, int(orig_tag_count * 0.25))
    required_line_changes = max(20, int(orig_tag_count * 0.4))

    # Decision logic
    if skeletons_identical and tags_identical:
        return {
            "is_structural": False,
            "confidence": 0.98,
            "reasoning": (
                f"After removing all styling attributes, the code structure is identical. "
                f"Tag sequence unchanged. Only {meaningful_changes} non-style lines differ. "
                f"This is a cosmetic-only change — the transformation engine produced "
                f"className tweaks instead of structural improvements."
            ),
        }

    if tag_changes < required_tag_changes // 2 and meaningful_changes < required_line_changes // 2:
        return {
            "is_structural": False,
            "confidence": 0.9,
            "reasoning": (
                f"Severely insufficient structural changes: {tag_changes} tag changes "
                f"vs {required_tag_changes} required, {meaningful_changes} meaningful "
                f"line changes vs {required_line_changes} required. "
                f"The before and after would look nearly identical."
            ),
        }

    if tag_changes >= required_tag_changes and meaningful_changes >= required_line_changes:
        return {
            "is_structural": True,
            "confidence": 0.95,
            "reasoning": (
                f"Strong structural transformation: {tag_changes} tag changes "
                f"(required {required_tag_changes}), {meaningful_changes} meaningful "
                f"line changes (required {required_line_changes}), "
                f"{new_tags} new tags, {removed_tags} removed tags."
            ),
        }

    if tag_changes >= required_tag_changes or meaningful_changes >= required_line_changes:
        return {
            "is_structural": True,
            "confidence": 0.75,
            "reasoning": (
                f"Moderate structural transformation: {tag_changes} tag changes, "
                f"{meaningful_changes} meaningful line changes "
                f"(required {required_tag_changes}/{required_line_changes}). "
                f"Visible difference but could be more aggressive."
            ),
        }

    # Below the bar — not dramatic enough.
    return {
        "is_structural": False,
        "confidence": 0.8,
        "reasoning": (
            f"Insufficient transformation: {tag_changes} tag changes, "
            f"{meaningful_changes} meaningful line changes "
            f"(required {required_tag_changes} tags AND {required_line_changes} lines). "
            f"The before/after would not be visibly different at a glance."
        ),
    }
