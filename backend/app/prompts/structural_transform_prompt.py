"""
Transformation prompt — REBUILD mode.

Philosophy: structural rebuild, visual inheritance. The model rebuilds the
JSX tree from scratch (new wrappers, new grouping, new hierarchy), but
inherits the original's visual identity (colors, type feel, radii, shadows,
spacing primitives). Same product, a better-structured version of itself —
not a redesign, not a re-brand.
"""

import json


# ── Score-driven rebuild playbook ─────────────────────────────────────
# Each weak dimension maps to concrete structural moves the model can
# actually execute. Replaces the generic "rebuild this dimension aggressively"
# directive that was producing templated, non-targeted output.
_DIMENSION_MOVES = {
    "layout_structure": (
        "Introduce semantic wrappers (header / main / section / aside) the original is missing. "
        "Regroup content into clearly-bounded card panels. Break single-column stacks into grids "
        "where content is parallel."
    ),
    "visual_hierarchy": (
        "Promote exactly one primary heading per section. Demote secondary actions to text or "
        "ghost buttons. Establish real size contrast — titles 2-3× the body text, not 1.1×."
    ),
    "spacing_consistency": (
        "Pick ONE section gap, ONE card padding, ONE grid gap — and use them everywhere. "
        "Kill arbitrary margins. Rhythm over density."
    ),
    "cta_clarity": (
        "Exactly one dominant CTA per view — prominent placement, solid color, larger size. "
        "Every other action demoted. No CTA competition."
    ),
    "component_quality": (
        "Upgrade primitive containers: stats become card grids with big numbers and small "
        "uppercase labels; lists become bordered cards with divide-y rows; forms become "
        "grouped sections with clear field spacing."
    ),
    "information_density": (
        "Decompress. Every element gets room to breathe. Break dense regions into distinct "
        "sections. If a region feels cramped at first glance, it is — add space."
    ),
}


def _compute_weakest_dimensions(breakdown: dict) -> list[tuple[str, int]]:
    """Return dimensions sorted by score ascending."""
    if not breakdown:
        return []
    items = [(k, v) for k, v in breakdown.items() if isinstance(v, (int, float))]
    items.sort(key=lambda x: x[1])
    return items


def build_transform_system_prompt() -> str:
    """
    System prompt: rebuild structure, inherit visual identity.

    The model should rebuild the JSX tree from scratch while keeping the
    original's colors, typography, radii, shadows, and spacing primitives.
    The result is the same product, better organized — not a redesign.
    """
    return """You are a UI rebuild engine. You rebuild the STRUCTURE of a page from scratch while inheriting its VISUAL IDENTITY.

CORE PRINCIPLE — two layers, one rebuilt, one preserved:

1. STRUCTURE — REBUILD from scratch.
   The JSX tree, element hierarchy, how content is grouped, where things sit on the page, section boundaries, wrapper elements, nesting. Discard the original layout and build a new one.

2. VISUAL IDENTITY — INHERIT from the original.
   The color palette, typography scale, border radii, shadow style, spacing primitives, iconography, dark/light mode. Whatever Tailwind classes the original uses for colors, fonts, and surface treatments — REUSE them. Do not swap the palette. Do not change the type feel. Do not redesign the brand.

The result is the same product, shipped by a more experienced team. A user should recognize their app immediately — but the layout should be dramatically better organized. Not a redesign. Not a re-brand. A structural rebuild wearing the original's skin.

REBUILD PROCESS:
1. Read the original and extract three things:
   (a) logic — imports, exports, hooks, state, props, types, handlers
   (b) content — headings, labels, copy, dynamic data expressions
   (c) visual tokens actually used — color classes (`bg-slate-900`, `text-indigo-600`), radii (`rounded-2xl`), shadows (`shadow-lg`), type weights, theme (dark/light)
2. Discard the original JSX layout entirely.
3. Rebuild a new JSX tree from scratch — new wrappers, new grouping, new hierarchy, new section boundaries.
4. When styling the new layout, REUSE the visual tokens from step 1(c). Inherit the brand. Do not invent a new palette.

WHAT A REBUILD LOOKS LIKE:
- The JSX tag sequence is fundamentally different — new wrappers, new nesting depth, new children arrangement.
- New semantic elements that did not exist before (header / main / section / aside wrappers, card containers).
- Content regrouped into bounded panels with clear boundaries.
- Different flow — single-column stacks become grids, loose lists become bordered cards with divide-y rows.
- Same data, same handlers, same colors — rearranged structure.

HARD CONSTRAINTS (never violate):
- Preserve every import, export, hook call, state declaration, handler, prop, and type. Logic is untouched.
- Same component name. Same default export.
- No new npm dependencies. Use only imports that already exist in the file.
- Use Tailwind CSS classes. Prefer the ones the original already uses for color, type, radius, and shadow.
- Return the COMPLETE rebuilt file, not a snippet or a diff.

SYNTAX SAFETY — the output must parse as TypeScript/JSX on the first try:
- Every opening tag has a matching closing tag. Self-closing tags end with `/>`.
- Every `{` inside JSX has a matching `}`. Count them before returning.
- No Python syntax leaking in: no `True` / `False` / `None`, no f-strings, no `def`, no tuples as JSX children.
- Do not break destructuring, spread, or template literals you did not intend to change.
- If you cannot confidently rebuild a fragment without breaking its JSX, leave that fragment structurally intact and rebuild around it.

OUTPUT: Return ONLY valid JSON, no markdown fences."""


def build_structural_transform_prompt(
    target_code: str,
    target_path: str,
    supporting_files: str,
    evaluation: dict,
    design_intelligence: dict,
    user_intent: str = "",
    is_retry: bool = False,
    attempt_number: int = 1,
    ux_lab_findings: list[dict] | None = None,
    previous_syntax_error: str = "",
) -> str:
    """User-message prompt with score-driven rebuild instructions."""
    score = evaluation.get("score", 50)
    issues = evaluation.get("issues", [])
    reasoning = evaluation.get("reasoning", "")
    breakdown = evaluation.get("breakdown", {})

    # Score-driven: each weak dimension gets a concrete rebuild move
    # instead of a generic "rebuild aggressively" directive.
    weakest = _compute_weakest_dimensions(breakdown)
    weak_dims = [(n, s) for n, s in weakest if s < 95]

    weak_section = ""
    if weak_dims:
        lines = []
        for name, sc in weak_dims[:4]:
            label = name.replace("_", " ").title()
            move = _DIMENSION_MOVES.get(name, "Rebuild this dimension.")
            lines.append(f"- {label} ({sc}/100)\n  {move}")
        weak_section = "PRIORITY MOVES (target the weakest dimensions first):\n" + "\n".join(lines)

    issues_text = ""
    if issues:
        issue_lines = [
            f"- [{i.get('severity','medium').upper()}] {i.get('area','')}: {i.get('description','')}"
            for i in issues[:6]
        ]
        issues_text = "ISSUES TO FIX:\n" + "\n".join(issue_lines)

    # Design intelligence — framed as "use these tokens", not "here's a dump".
    di = design_intelligence or {}
    di_text = ""
    if di.get("design_tokens") or di.get("recommendations"):
        di_parts = []
        if di.get("design_tokens"):
            di_parts.append(
                "Design tokens — USE THESE for colors, typography, radii, and shadows. "
                "Do not invent a new palette:\n"
                + json.dumps(di["design_tokens"], indent=2)[:1500]
            )
        if di.get("recommendations"):
            di_parts.append(
                "Structural recommendations to apply:\n"
                + json.dumps(di["recommendations"])[:500]
            )
        di_text = "\n\n".join(di_parts)

    intent_line = f"\nUSER INTENT: {user_intent}" if user_intent else ""

    ux_findings_text = ""
    if ux_lab_findings:
        lines = []
        for f in ux_lab_findings:
            severity = f.get("severity", "major").upper()
            component = f.get("component", "")
            title = f.get("title", "")
            recommendation = f.get("recommendation", "")
            lines.append(f"- [{severity}] {component} — \"{title}\"\n  Fix: {recommendation}")
        ux_findings_text = (
            "## UX LAB FINDINGS — MUST FIX\n"
            "These issues were identified by UX analysis. Each one must be visibly addressed "
            "in the rebuild.\n\n"
            + "\n\n".join(lines)
        )

    # Retry block — factual and specific. No "REJECTED" theatrics. The goal
    # is a more careful next attempt, not a more frantic one.
    retry_block = ""
    if is_retry:
        if previous_syntax_error:
            retry_block = f"""
ATTEMPT {attempt_number}. The previous attempt failed to parse as TypeScript/JSX:

    {previous_syntax_error}

This is a .tsx file. Common causes: unclosed tag, unbalanced `{{` / `}}`, a stray `:` or `,` where
JSX expects a child, mismatched quotes, or Python literals leaking in (`True`/`False`/`None`).
Fix the specific error above, keep the rebuild quality high, and re-balance braces and tags
before returning.
"""
        else:
            retry_block = f"""
ATTEMPT {attempt_number}. The previous attempt was structurally too close to the original —
the JSX tag sequence barely changed. This time, rebuild MORE of the tree:
- Add new wrapper elements (header / main / section / aside) that did not exist before.
- Regroup content into new card containers with clear boundaries.
- Change how top-level children are nested and ordered.
Visual identity stays the same (same colors, same fonts, same radii). Only the STRUCTURE changes.
"""

    return f"""{retry_block}Rebuild this page. Current score: {score}/100.

{weak_section}

{issues_text}

{ux_findings_text}

Evaluation reasoning: {reasoning}
{intent_line}

## ORIGINAL CODE — extract logic, content, and visual tokens, then rebuild the structure
File: {target_path}
```tsx
{target_code}
```

## SUPPORTING FILES (read-only context)
{supporting_files}

{f"## DESIGN INTELLIGENCE{chr(10)}{di_text}" if di_text else ""}

## REBUILD CHECKLIST

Layout
- New top-level wrapper structure. Prefer semantic elements (header, main, section, aside).
- Add a max-width container if the original lacks one.
- Group related content into bounded card panels with consistent borders and padding.
- If the original is single-column, move parallel content into a grid where it makes sense.

Hierarchy
- Exactly one primary heading per section. Demote the rest.
- Exactly one dominant CTA per view. Other actions become text or ghost buttons.
- Real typographic contrast — titles visibly larger and heavier than body text.

Spacing rhythm
- Pick one section gap (e.g., `space-y-8`, `space-y-10`, `space-y-12`) and use it throughout.
- Pick one card padding (e.g., `p-6`, `p-8`) and use it throughout.
- Pick one grid / list gap (e.g., `gap-4`, `gap-6`) and use it throughout.
- No arbitrary margins. Rhythm over density.

Components
- Stats / KPIs → card grid with large numbers and small uppercase labels.
- Lists → card-bounded with divide-y rows and proper padding.
- Forms → grouped into labeled sections with space between fields.
- Buttons → consistent sizing, obvious hover states.

Visual identity — INHERIT, do not change
- Keep the color palette the original uses. Dark theme stays dark. Indigo stays indigo.
- Keep the border-radius style (if the original uses `rounded-2xl`, stay `rounded-2xl`).
- Keep the shadow style and density.
- Keep the font feel and weight vocabulary.
- Do not swap Tailwind color families. Do not introduce a new accent.

Logic — PRESERVE exactly
- Every import stays. Every export stays. Every hook call stays.
- Every handler stays bound to the same action it handled in the original.
- Every JSX expression that references dynamic data — `{{variable}}`, `{{fn()}}`, `{{list.map(...)}}` — appears somewhere in the rebuilt tree.
- Component name and default export are unchanged.

## OUTPUT FORMAT

Return ONLY this JSON, no markdown fences:
{{
  "updated_code": "the COMPLETE rebuilt file",
  "diff_summary": "1 sentence in plain English — what the user sees differently",
  "change_annotations": [
    {{
      "region": "section name",
      "change_type": "layout|hierarchy|spacing|cta|component|clutter",
      "description": "visible change in plain English",
      "ux_impact": "why it's better for the user"
    }}
  ],
  "change_summary": ["visible improvement in plain English"]
}}"""
