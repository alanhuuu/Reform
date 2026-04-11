"""
Transformation prompt — REBUILD mode.
The model must treat every page as a layout rebuild from scratch,
not an edit of the existing structure.
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
    """System prompt that sets REBUILD mode. Short, absolute, non-negotiable."""
    return """You are a UI rebuild engine. You do NOT edit UIs — you REBUILD them from scratch.

CORE RULE: Ignore the original JSX layout structure entirely. Extract the data (props, state, variables, content) and the actions (handlers, callbacks, navigation), then build a completely new layout using modern best practices.

The original layout is WRONG. Do not preserve it. Do not slightly modify it. Build a new one.

REBUILD PROCESS:
1. Read the original code and identify: data, state, props, handlers, imports, exports
2. DISCARD the original JSX layout — pretend it doesn't exist
3. Build a new JSX layout from scratch using the same data and handlers
4. The new layout must use: semantic sections (header/main/section/aside), card containers, proper grid systems, generous spacing, clear visual hierarchy

WHAT "REBUILD" MEANS:
- The JSX tree structure must be fundamentally different
- New wrapper elements that did not exist before (header, main, section, aside, cards)
- Different element nesting and grouping
- Different component placement and flow
- The before and after must look like different products

HARD CONSTRAINTS:
- Keep ALL imports, exports, hooks, state, handlers, props, types — do not change logic
- Same component name and file export
- No new npm dependencies
- Use Tailwind CSS classes
- Return the COMPLETE file — not a snippet

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
            di_parts.append(f"Design tokens: {json.dumps(di['design_tokens'], indent=2)[:1500]}")
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
        retry_block = f"""
⚠️ ATTEMPT {attempt_number} — PREVIOUS ATTEMPT REJECTED

Your previous output was REJECTED because the before/after looked too similar.
The layout structure was too close to the original.

This time: DO NOT reference the original layout AT ALL.
Start from a blank page. Place elements in a completely new arrangement.
The result must pass this test: "Does this look like a different product?"
If no → you will be rejected again.
"""

    return f"""{retry_block}REBUILD this page. Score: {score}/100.

{weak_section}

{issues_text}

{ux_findings_text}

Assessment: {reasoning}

{intent_line}

## ORIGINAL CODE — extract data and handlers, then DISCARD the layout
File: {target_path}
```tsx
{target_code}
```

## SUPPORTING FILES (read-only context)
{supporting_files}

{f"## DESIGN INTELLIGENCE{chr(10)}{di_text}" if di_text else ""}

## REBUILD REQUIREMENTS

1. LAYOUT: Create a new page structure with semantic wrappers (header, main, section).
   Use a max-width container (max-w-7xl mx-auto). Group content into card panels.
   If the original is single-column, make it multi-column or grid-based.

2. SPACING: Generous spacing throughout. Section gaps: space-y-10 or larger.
   Card padding: p-6 minimum (p-8 preferred). Grid gaps: gap-6 minimum.
   NO cramped layouts. Double whatever the original had.

3. HIERARCHY: ONE primary heading per section (text-2xl+ font-bold).
   Clear typographic scale: title > section heading > body > caption.
   ONE dominant CTA per page — large, colored, prominent position.
   All other actions demoted to text or outlined buttons.

4. COMPONENTS: Stats → card grid with large bold numbers + tiny uppercase labels.
   Lists → card-wrapped sections with divide-y rows + metadata.
   Forms → grouped sections with proper labels and spacing.
   Buttons → properly sized (px-6 py-3) with hover states.

5. CLUTTER: Remove visual noise. Simplify dense areas. Every element earns its space.

## EXAMPLE — this is the level of change required

BEFORE (flat, cramped, multi-CTA):
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

AFTER (structured, spacious, single primary CTA):
```tsx
<div className="min-h-screen bg-slate-50">
  <header className="border-b bg-white px-8 py-6">
    <div className="max-w-7xl mx-auto flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Overview</p>
      </div>
      <button onClick={{addUser}} className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700">
        + Add User
      </button>
    </div>
  </header>
  <main className="max-w-7xl mx-auto px-8 py-10 space-y-10">
    <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="bg-white rounded-2xl border p-8">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Users</p>
        <p className="text-4xl font-bold text-slate-900 mt-2">{{users}}</p>
      </div>
      <div className="bg-white rounded-2xl border p-8">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Revenue</p>
        <p className="text-4xl font-bold text-slate-900 mt-2">${{revenue}}</p>
      </div>
    </section>
    <section className="bg-white rounded-2xl border overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b">
        <h2 className="text-lg font-semibold">Activity</h2>
        <div className="flex gap-2">
          <button onClick={{refresh}} className="text-sm text-slate-500 hover:text-slate-900">Refresh</button>
          <button onClick={{exportData}} className="text-sm text-slate-500 hover:text-slate-900">Export</button>
        </div>
      </div>
      <ul className="divide-y">
        {{items.map(i => (
          <li key={{i.id}} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50">
            <span className="font-medium text-slate-900">{{i.name}}</span>
            <span className="text-xs px-3 py-1 rounded-full bg-slate-100 text-slate-600">{{i.status}}</span>
          </li>
        ))}}
      </ul>
    </section>
  </main>
</div>
```

Note: COMPLETELY different JSX tree. New header/main/section wrappers. Stats in card grid. List in card with header. One primary CTA. Same data + handlers.

YOUR OUTPUT must show this level of structural difference.

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
