"""Prompt for Claude-based UI quality evaluation."""

import json


def build_ui_evaluation_prompt(
    page_code: str,
    page_path: str,
    dependency_code: str,
    design_context: str = "",
) -> str:
    """Build a prompt that asks Claude to evaluate UI quality of a single page."""

    design_section = ""
    if design_context:
        design_section = f"""
## DESIGN CONTEXT (from competitor analysis)
{design_context}

Use this context to calibrate your expectations — score relative to modern SaaS standards.
"""

    return f"""You are a senior UI/UX auditor evaluating the quality of a frontend page.

## PAGE: {page_path}
```tsx
{page_code}
```

## IMPORTED DEPENDENCIES (for context only)
{dependency_code}
{design_section}
---

## YOUR TASK

Evaluate this page's UI quality across 6 dimensions. Score each 0-100.

### Scoring Dimensions

1. **layout_structure** (weight: 25%)
   - Are there clear, distinct sections?
   - Is related content grouped together (cards, panels, sections)?
   - Is there a logical top-to-bottom flow?
   - Or is it a flat wall of elements with no grouping?

2. **visual_hierarchy** (weight: 25%)
   - Can you identify the page's purpose within 3 seconds?
   - Is there a clear primary heading?
   - Do font sizes, weights, and colors create a scannable hierarchy?
   - Or does everything compete for attention equally?

3. **spacing_consistency** (weight: 15%)
   - Is there a consistent spacing system (e.g. 4px, 8px, 16px, 24px scale)?
   - Are margins and paddings uniform across similar elements?
   - Or are spacing values random and inconsistent?

4. **cta_clarity** (weight: 15%)
   - Is there a clear primary call-to-action?
   - Is it visually dominant (larger, colored, well-placed)?
   - Are secondary actions visually subordinate?
   - Or are there competing buttons with equal weight?

5. **component_quality** (weight: 10%)
   - Are buttons, inputs, cards styled consistently?
   - Do they follow modern patterns (rounded corners, proper padding, hover states)?
   - Or are they inconsistent in style, size, or behavior?

6. **information_density** (weight: 10%)
   - Is there the right amount of content per section?
   - Is whitespace used effectively to separate concerns?
   - Or are sections overloaded or too sparse?

### Scoring Calibration (BE HONEST — do NOT inflate scores)

- **90-100**: Professionally designed. Clean, structured, polished. No obvious issues.
- **70-89**: Decent UI. Works but has clear areas for improvement. Some inconsistencies.
- **50-69**: Significant problems. Poor layout structure, weak hierarchy, cluttered sections.
- **30-49**: Major restructuring needed. Flat layout, no visual system, competing elements.
- **0-29**: Barely functional UI. No design consideration visible.

Most real-world pages score 50-80. A score of 90+ should be rare and reserved for genuinely polished UI. Do NOT give high scores to pages that merely "work" — evaluate against modern SaaS standards.

### Verdict Rules

- If overall score >= 85 → verdict = "high_quality"
- If overall score < 85 → verdict = "needs_improvement"

### Issue Identification

List specific, actionable issues. For each:
- **area**: Which part of the page (e.g. "Hero section", "Navigation", "Form area", "Footer")
- **severity**: "high" (blocks usability), "medium" (noticeable problem), "low" (minor polish)
- **description**: What's wrong and why it matters. Write for a designer, not a developer.

## OUTPUT FORMAT

Return ONLY valid JSON — no markdown fences, no explanation.

{{
  "score": <overall weighted score 0-100>,
  "breakdown": {{
    "layout_structure": <0-100>,
    "visual_hierarchy": <0-100>,
    "spacing_consistency": <0-100>,
    "cta_clarity": <0-100>,
    "component_quality": <0-100>,
    "information_density": <0-100>
  }},
  "issues": [
    {{
      "area": "<section name>",
      "severity": "high|medium|low",
      "description": "<what's wrong and why>"
    }}
  ],
  "verdict": "high_quality|needs_improvement",
  "reasoning": "<2-3 sentence summary of the page's UI quality and main problems>"
}}"""
