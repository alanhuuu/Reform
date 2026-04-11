"""
Transformation prompt — REBUILD mode.
The model must treat every page as a layout rebuild from scratch,
not an edit of the existing structure. Aggressively anti-AI-slop:
structure changes, brand personality and product vocabulary do not.
"""

import json


def _compute_weakest_dimensions(breakdown: dict) -> list[tuple[str, int]]:
    """Return dimensions sorted by score ascending."""
    if not breakdown:
        return []
    items = [(k, v) for k, v in breakdown.items() if isinstance(v, (int, float))]
    items.sort(key=lambda x: x[1])
    return items


def build_transform_system_prompt() -> str:
    """System prompt that sets REBUILD-but-keep-the-voice mode."""
    return """You are a UI structural rebuild engine. You rebuild page LAYOUTS without replacing the product's identity.

CORE RULE: Extract the data, handlers, and content from the original. Discard the layout tree. Build a new layout that is structurally different but still feels like the same product.

The original layout's STRUCTURE is wrong. Its voice, brand, and personality are not — preserve them.

REBUILD PROCESS:
1. Read the original. Identify:
   - data, state, props, handlers, imports, exports (preserve all of these)
   - the product's personality: minimal, editorial, playful, utilitarian, technical, or luxurious
   - the product's visual vocabulary: color temperature, typography weight, density, radius, existing Tailwind patterns
2. Discard the original JSX tree. You are not editing it.
3. Build a new tree that fixes the structural problems — hierarchy, density, flow, CTA clarity — while staying inside the product's personality and vocabulary.

WHAT CHANGES:
- JSX tree topology, element nesting, section boundaries
- Information architecture: grouping, ordering, emphasis
- Hierarchy: what is primary vs secondary
- Density: breathing room where cramped, tightening where sparse
- Action clarity: one primary action per view, others demoted

WHAT DOES NOT CHANGE:
- Component logic, handlers, props, state, imports, exports
- Brand colors, typography, radius — derive these from the design tokens passed in, NOT from generic SaaS defaults
- The product's voice, tone, and content (copy stays, labels stay, numbers stay)

AVOID the generic AI look. This is the most common reason past rebuilds have been rejected:
- Do NOT default to slate / indigo / violet / purple gradients unless the product already uses them
- Do NOT wrap everything in `rounded-2xl border bg-white` or `bg-slate-50` cards
- Do NOT use `text-xs uppercase tracking-wider` labels unless the original already treats things that way
- Do NOT add stat-card grids to pages that do not display stats
- Do NOT force a single hero CTA onto pages that are not landing / marketing
- Do NOT add gradients, glows, glassmorphism, or emoji bullets that were not in the source
- Do NOT invent "Overview", "Welcome back", or "Quick actions" subtitles
- Do NOT default to `max-w-7xl mx-auto` — match the width the product actually uses
- Do NOT center content just to make it look balanced

Restraint beats ornament. If you cannot name a concrete structural reason for an element, delete it.

HARD CONSTRAINTS:
- Keep ALL imports, exports, hooks, state, handlers, props, types — do not change logic
- Same component name and file export
- No new npm dependencies
- Use Tailwind CSS classes, staying within the product's existing vocabulary
- Return the COMPLETE file — not a snippet

LANGUAGE IS TYPESCRIPT/JSX — NEVER PYTHON. This is critical.
The file will be executed by Node/Next.js, not Python. Any Python syntax
will crash the page at runtime.

FORBIDDEN (will cause runtime errors):
- Tuple literals `("alice", 142)` → use arrays `["alice", 142]` or objects `{ name: "alice", value: 142 }`
- f-strings `f"hello {name}"` → use template literals `` `hello ${name}` ``
- `print(...)` → use `console.log(...)`
- `def name():` → use `function name() {}` or `const name = () => {}`
- `from X import Y` → use `import { Y } from "X"`
- `True` / `False` / `None` → use `true` / `false` / `null`
- `dict(...)` / `list(...)` → use `{}` / `[]`

Before returning your JSON, mentally compile the code. Check every array literal for nested tuples. Check every string for f-prefix. Check that every bracket is balanced.

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
    """User-message prompt with the code, evaluation, and rebuild directives."""
    score = evaluation.get("score", 50)
    issues = evaluation.get("issues", [])
    reasoning = evaluation.get("reasoning", "")
    breakdown = evaluation.get("breakdown", {})

    # Score-driven: identify weakest dimensions
    weakest = _compute_weakest_dimensions(breakdown)
    weak_dims = [(n, s) for n, s in weakest if s < 95]

    weak_section = ""
    if weak_dims:
        lines = []
        for name, sc in weak_dims[:4]:
            n = name.replace("_", " ").title()
            lines.append(f"- {n}: {sc}/100 — REBUILD this dimension aggressively")
        weak_section = "WEAKEST DIMENSIONS (target these hardest):\n" + "\n".join(lines)

    issues_text = ""
    if issues:
        issue_lines = [
            f"- [{i.get('severity','medium').upper()}] {i.get('area','')}: {i.get('description','')}"
            for i in issues[:6]
        ]
        issues_text = "ISSUES TO FIX:\n" + "\n".join(issue_lines)

    # Design intelligence — keep brief
    di = design_intelligence or {}
    di_text = ""
    if di.get("design_tokens") or di.get("recommendations"):
        di_parts = []
        if di.get("design_tokens"):
            di_parts.append(f"Design tokens (USE THESE — do not substitute generic slate/indigo):\n{json.dumps(di['design_tokens'], indent=2)[:1500]}")
        if di.get("recommendations"):
            di_parts.append(f"Recommendations: {json.dumps(di['recommendations'])[:500]}")
        di_text = "\n".join(di_parts)

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
            "## UX LAB FINDINGS — MUST FIX (TOP PRIORITY)\n"
            "These issues were identified by UX analysis and MUST be visibly addressed in the rebuild. Do not skip any.\n\n"
            + "\n\n".join(lines)
        )

    retry_block = ""
    if is_retry:
        if previous_syntax_error:
            retry_block = f"""
⚠️ ATTEMPT {attempt_number} — PREVIOUS ATTEMPT REJECTED (SYNTAX ERROR)

Your previous output was REJECTED because it contained invalid JavaScript:

    {previous_syntax_error}

This code would have crashed the Next.js dev server or broken the page at runtime.
Remember: the file is TypeScript/JSX, not Python. Before returning this time,
walk through your code mentally and check every array, every string, every
function call. No tuples. No f-strings. No `True`/`False`/`None`. No `print`.
No `def`. Balanced braces.

Fix the specific problem above AND produce the same level of structural rebuild.
"""
        else:
            retry_block = f"""
⚠️ ATTEMPT {attempt_number} — PREVIOUS ATTEMPT REJECTED

Your previous output was REJECTED because the before/after looked too similar
OR because it drifted into generic AI-dashboard styling (slate/indigo, rounded-2xl
card-everything, invented subtitles, hero CTAs where none belong).

This time:
- DO NOT reference the original layout tree AT ALL — start from a blank tree.
- DO NOT reach for slate/indigo/violet defaults. Use the product's own tokens.
- DO NOT card-wrap every element. Use restraint.
- The result must pass two tests: "Does this look like a different layout?"
  AND "Does this still look like the SAME product?" Both must be yes.
"""

    return f"""{retry_block}REBUILD this page structurally. Score: {score}/100.

{weak_section}

{issues_text}

{ux_findings_text}

Assessment: {reasoning}
{intent_line}

## ORIGINAL CODE — extract data and handlers, then discard the layout tree
File: {target_path}
```tsx
{target_code}
```

## SUPPORTING FILES (read-only context)
{supporting_files}

{f"## DESIGN INTELLIGENCE{chr(10)}{di_text}" if di_text else ""}

## REBUILD PRINCIPLES

1. MATCH THE PRODUCT'S PERSONALITY. Before you write code, internally answer: is this
   product minimal, editorial, playful, utilitarian, technical, or luxurious? Keep that
   personality. Structure changes; voice does not.

2. USE THE PRODUCT'S OWN DESIGN TOKENS. Colors, radius, typography, and density come
   from the design tokens above (or from what you can infer from the original if none
   are provided). Do NOT substitute generic slate / indigo / violet / rounded-2xl just
   because it is your default.

3. FIX STRUCTURE, NOT STYLING. The real problems are hierarchy, density, flow, and CTA
   clarity. If the original is cramped, add breathing room. If it is flat, build a
   hierarchy. If actions compete, demote the secondary ones. If content is
   undifferentiated, group it.

4. EVERY ELEMENT EARNS ITS PLACE. If you cannot give a concrete structural reason for
   an element, delete it. No decorative wrappers. No invented "Overview" subtitles. No
   stat cards if the page has no stats. No hero CTA if the page is not a landing page.

## AVOID these AI-generated tropes (most common rejection cause)

- Defaulting to slate / indigo / violet / purple gradients regardless of the product's palette
- Wrapping everything in `rounded-2xl border bg-white` or `bg-slate-50` cards
- `text-xs uppercase tracking-wider` labels unless the original already uses that treatment
- Stat-card grids on pages that do not display stats
- A single hero CTA on pages that are not landing / marketing
- Gradients, glows, glassmorphism, or emoji bullets that were not in the source
- "Overview" / "Welcome back" / "Quick actions" subtitles you invented
- `max-w-7xl mx-auto` by default — match the width the product actually uses
- Centering everything just to make it look balanced

## STRUCTURAL CHANGES TO MAKE

- Semantic wrappers where missing: header, main, section, aside
- Clearer hierarchy: one primary heading per section, consistent type scale
- Grouping: related controls and data in the same container
- Ordering: most important content first
- Density: generous spacing in cramped areas, tightening in sparse ones
- Action clarity: ONE primary action per view, others demoted to plain / ghost buttons

## EXAMPLE — the level of structural change required

BEFORE (flat, cramped, three competing CTAs):
```tsx
<div className="p-4">
  <h1>Dashboard</h1>
  <div>Users: {{users}}</div>
  <div>Revenue: ${{revenue}}</div>
  <button onClick={{refresh}}>Refresh</button>
  <button onClick={{exportData}}>Export</button>
  <button onClick={{addUser}}>Add User</button>
  <ul>{{items.map(i => <li key={{i.id}}>{{i.name}} - {{i.status}}</li>)}}</ul>
</div>
```

AFTER — same data and handlers, new topology. This example deliberately shows
STRUCTURE ONLY — className values are intentionally omitted so you do not copy generic
SaaS defaults. Your own output MUST be fully styled, using the product's own design
tokens and existing Tailwind vocabulary, NOT the slate / indigo / rounded-2xl default:

```tsx
<div>
  <header>
    <div>
      <h1>Dashboard</h1>
    </div>
    <button onClick={{addUser}}>Add user</button>
  </header>
  <main>
    <section aria-label="metrics">
      <div>
        <p>Users</p>
        <p>{{users}}</p>
      </div>
      <div>
        <p>Revenue</p>
        <p>${{revenue}}</p>
      </div>
    </section>
    <section aria-label="activity">
      <div>
        <h2>Activity</h2>
        <div>
          <button onClick={{refresh}}>Refresh</button>
          <button onClick={{exportData}}>Export</button>
        </div>
      </div>
      <ul>
        {{items.map(i => (
          <li key={{i.id}}>
            <span>{{i.name}}</span>
            <span>{{i.status}}</span>
          </li>
        ))}}
      </ul>
    </section>
  </main>
</div>
```

Structural differences to notice:
- Flat `div` → semantic `header` / `main` / `section`
- Three equal-weight buttons → one primary action in the header, two demoted next to the list
- Undifferentiated metrics → grouped in their own metrics section
- Orphaned list → grouped under an activity section with its own header

Your output must show this level of structural difference AND be fully styled using the
product's existing tokens, colors, typography, and Tailwind vocabulary.

## OUTPUT FORMAT

Return ONLY this JSON:
{{
  "updated_code": "the COMPLETE rebuilt file",
  "diff_summary": "1 sentence: what the user sees differently (no code terms)",
  "change_annotations": [
    {{
      "region": "section name",
      "change_type": "layout|hierarchy|spacing|cta|component|clutter",
      "description": "visible change (no code terms)",
      "ux_impact": "why it's better"
    }}
  ],
  "change_summary": ["visible improvement in plain English"]
}}"""
