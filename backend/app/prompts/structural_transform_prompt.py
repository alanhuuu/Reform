"""
Enhanced transformation prompt that enforces STRUCTURAL changes,
not cosmetic tweaks. Issue-driven: uses evaluator output to target
specific problems.
"""

import json


def build_structural_transform_prompt(
    target_code: str,
    target_path: str,
    supporting_files: str,
    evaluation: dict,
    design_intelligence: dict,
    user_intent: str = "",
    is_retry: bool = False,
) -> str:
    """
    Build a prompt that instructs Claude to perform structural UI refactoring.

    Args:
        target_code: The full source code of the page to transform.
        target_path: File path of the target.
        supporting_files: Formatted string of imported files for context.
        evaluation: Dict with score, breakdown, issues, reasoning from the evaluator.
        design_intelligence: Competitor analysis data (tokens, patterns, etc.).
        user_intent: Optional user-provided goal.
        is_retry: If True, the previous attempt was cosmetic-only.
    """
    # Extract evaluation data
    score = evaluation.get("score", 50)
    issues = evaluation.get("issues", [])
    reasoning = evaluation.get("reasoning", "")
    breakdown = evaluation.get("breakdown", {})

    issues_text = ""
    if issues:
        issue_lines = []
        for issue in issues:
            sev = issue.get("severity", "medium").upper()
            area = issue.get("area", "Unknown")
            desc = issue.get("description", "")
            issue_lines.append(f"  - [{sev}] {area}: {desc}")
        issues_text = "\n".join(issue_lines)
    else:
        issues_text = "  No specific issues identified — apply general improvements."

    breakdown_text = ""
    if breakdown:
        breakdown_text = "\n".join(
            f"  - {k.replace('_', ' ').title()}: {v}/100"
            for k, v in breakdown.items()
        )

    # Extract design intelligence sections
    di = design_intelligence or {}
    design_tokens = di.get("design_tokens", {})
    global_patterns = di.get("global_patterns", {})
    components = di.get("components", {})
    recommendations = di.get("recommendations", [])
    avoid = di.get("avoid", [])

    intent_line = ""
    if user_intent:
        intent_line = f"\n## USER INTENT\n{user_intent}\n"

    retry_warning = ""
    if is_retry:
        retry_warning = """
## ⚠️  CRITICAL RETRY WARNING ⚠️

Your PREVIOUS attempt was REJECTED because it only made COSMETIC changes
(padding, font sizes, colors, className tweaks). Those changes are NOT sufficient.

This time you MUST make STRUCTURAL changes:
- Reorganize sections and reorder content
- Introduce new grouping containers (cards, panels, grid sections)
- Change the composition of the page layout
- Restructure the visual hierarchy by changing what elements exist and how they nest
- Add or restructure section dividers, headers, content areas

If you only change className or style props again → this will be REJECTED again.
"""

    return f"""{retry_warning}You are a senior React + Tailwind engineer performing a STRUCTURAL UI refactor.

This is NOT a styling task. You must significantly improve layout, hierarchy, and usability.

## QUALITY EVALUATION (this page scored {score}/100)

### Overall Assessment
{reasoning}

### Score Breakdown
{breakdown_text}

### Specific Issues to Fix
{issues_text}

---

## TARGET FILE: {target_path}
```tsx
{target_code}
```

## SUPPORTING FILES (for context — do NOT modify these)
{supporting_files}

## DESIGN INTELLIGENCE

### Design Tokens
{json.dumps(design_tokens, indent=2) if design_tokens else "No design tokens available."}

### Global Patterns to Apply
{json.dumps(global_patterns, indent=2) if global_patterns else "No global patterns available."}

### Component Patterns
{json.dumps(components, indent=2) if components else "No component patterns available."}

### Recommendations
{json.dumps(recommendations, indent=2) if recommendations else "No specific recommendations."}

### Anti-Patterns to AVOID
{json.dumps(avoid, indent=2) if avoid else "No specific anti-patterns listed."}
{intent_line}
---

## TRANSFORMATION RULES (CRITICAL — follow in this exact order)

### RULE 0: STRUCTURAL CHANGES ARE MANDATORY

You MUST change the JSX TREE STRUCTURE, not just styles. Specifically:

- You MUST introduce new grouping elements (section wrappers, card containers, grid layouts)
- You MUST reorder or reorganize content sections for better logical flow
- You MUST change the nesting hierarchy of elements
- You MUST improve the composition (how sections relate to each other spatially)

Changes that ONLY modify className, style props, font sizes, padding, or colors
are NOT sufficient and will be REJECTED.

### Step 1: Layout Restructuring (HIGHEST PRIORITY)
- Break flat structures into distinct card/panel sections
- Group related elements into containers with clear boundaries
- Introduce grid or flexbox layouts where content is currently stacked vertically
- Add section headers and dividers to separate concerns
- Apply modern SaaS patterns: dashboard grids, card layouts, sidebar+main patterns

### Step 2: Visual Hierarchy
- Make the page's purpose obvious within 3 seconds
- Ensure primary CTA is visually dominant (largest, most colorful, best-placed)
- Create a clear reading order: title → description → content → action
- Reduce competing elements that fight for attention

### Step 3: UX Flow Improvements
- Surface important actions prominently
- Reduce clicks needed for common tasks
- Consolidate related information that is spread across sections
- Add clear visual paths that guide the user

### Step 4: Spacing & Component Polish
- Apply consistent spacing scale
- Ensure consistent button, card, and input styling
- Apply hover/focus states
- Use Tailwind classes (prefer utilities over arbitrary values)

## STRICT CONSTRAINTS
- This is a REFACTOR, NOT a rewrite
- PRESERVE all imports, exports, hooks, state, event handlers, and business logic
- DO NOT remove any functionality
- DO NOT rename props or state variables
- DO NOT add new dependencies or imports that don't exist
- DO NOT change file structure
- KEEP the same component names
- Return the COMPLETE updated file — not a partial snippet
- Prefer Tailwind classes over inline styles

## OUTPUT FORMAT

Return a JSON object with this exact structure:
{{
  "updated_code": "the complete refactored file content",
  "diff_summary": "1 sentence, plain English, no code terms",
  "change_annotations": [
    {{
      "region": "human-readable section name (NOT code terms)",
      "change_type": "flow|layout|spacing|component|visual",
      "description": "Plain English description a designer would write",
      "ux_impact": "User-facing benefit in plain English"
    }}
  ],
  "change_summary": [
    "Plain English improvement a non-developer would understand"
  ]
}}

CRITICAL LANGUAGE RULES for all text fields:
- Write as if explaining to a product manager or designer
- NEVER use: className, div, span, Tailwind, CSS, px, rem, hex, tag, element, utility
- Focus on WHAT THE USER SEES, not what the code does

Return ONLY valid JSON — no markdown fences, no explanation."""
