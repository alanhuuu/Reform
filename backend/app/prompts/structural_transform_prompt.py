"""
Transformation prompt that enforces DRAMATIC, VISIBLE structural changes.
The before/after must be obviously different at a glance — if a non-technical
user can't see the improvement in under 1 second, the transformation has failed.
"""

import json


# Worked example: weak → strong layout. Included verbatim in the prompt so the
# model has a concrete reference for what "dramatically better" looks like.
WORKED_EXAMPLE = """
### WORKED EXAMPLE — weak layout → strong layout

WEAK (before):
```tsx
export default function Dashboard() {
  return (
    <div className="p-4">
      <h1>Dashboard</h1>
      <p>Welcome back, here are your stats</p>
      <div>Users: {users}</div>
      <div>Revenue: ${revenue}</div>
      <div>Orders: {orders}</div>
      <button onClick={refresh}>Refresh</button>
      <button onClick={exportData}>Export</button>
      <button onClick={addUser}>Add User</button>
      <ul>
        {items.map(item => <li key={item.id}>{item.name} - {item.status}</li>)}
      </ul>
    </div>
  )
}
```

Why it's weak: flat single column, no grouping, three competing CTAs, stats are
plain divs, list is unstyled, no hierarchy, cramped padding.

STRONG (after):
```tsx
export default function Dashboard() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header bar with single primary CTA */}
      <header className="border-b border-slate-200 bg-white px-8 py-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
            <p className="text-sm text-slate-500 mt-1">Welcome back — here's your overview</p>
          </div>
          <button onClick={addUser} className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-sm hover:bg-indigo-700 transition">
            + Add User
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 py-10 space-y-10">
        {/* Stat cards in a grid — visual hierarchy via large numbers */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Users</p>
            <p className="text-4xl font-bold text-slate-900 mt-2">{users}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Revenue</p>
            <p className="text-4xl font-bold text-slate-900 mt-2">${revenue}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Orders</p>
            <p className="text-4xl font-bold text-slate-900 mt-2">{orders}</p>
          </div>
        </section>

        {/* Items section with proper card, header, and demoted secondary actions */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-900">Recent Activity</h2>
            <div className="flex items-center gap-2">
              <button onClick={refresh} className="text-sm text-slate-500 hover:text-slate-900 px-3 py-1.5">Refresh</button>
              <button onClick={exportData} className="text-sm text-slate-500 hover:text-slate-900 px-3 py-1.5">Export</button>
            </div>
          </div>
          <ul className="divide-y divide-slate-100">
            {items.map(item => (
              <li key={item.id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50">
                <span className="font-medium text-slate-900">{item.name}</span>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">{item.status}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}
```

Note what changed STRUCTURALLY (not just styling):
- Added <header>, <main>, three <section> wrappers — page now has clear regions
- Stats moved from flat divs into a 3-column grid of cards
- One primary CTA (Add User) is large, colored, top-right; the other two CTAs
  (Refresh, Export) demoted to small text buttons inside the list card header
- The unstyled <ul> became a card-wrapped section with a header bar, dividers,
  and a status pill on each row
- Generous spacing scale: py-6, py-10, gap-6, p-6 — no cramped p-4 anywhere
- All business logic (users, revenue, orders, items, refresh, exportData,
  addUser) preserved exactly. Same props, same handlers, same state.

Same data. Same logic. Completely different product.
"""


def _compute_weakest_dimensions(breakdown: dict) -> list[tuple[str, int]]:
    """Return the weakest dimensions sorted ascending by score.
    The model should target these the hardest."""
    if not breakdown:
        return []
    items = [(k, v) for k, v in breakdown.items() if isinstance(v, (int, float))]
    items.sort(key=lambda x: x[1])
    return items


def _dimension_directive(name: str, score: int) -> str:
    """Map a weak sub-dimension to a concrete imperative for the model."""
    name_l = name.lower()
    if "layout" in name_l:
        return (
            f"LAYOUT IS WEAK ({score}/100). You MUST restructure the page into clear "
            "regions: header, main content area with sectioned grid, and footer/sidebar "
            "if appropriate. Wrap related content in card containers. The original "
            "flat structure is unacceptable."
        )
    if "hierarchy" in name_l:
        return (
            f"HIERARCHY IS WEAK ({score}/100). You MUST establish one dominant element "
            "per section. Use a typographic scale (text-3xl/text-xl/text-sm) so headings "
            "are unmistakably larger than body. Demote competing elements visually."
        )
    if "spacing" in name_l:
        return (
            f"SPACING IS WEAK ({score}/100). You MUST at least double the padding and "
            "gaps. Replace cramped p-2/p-4 with p-6/p-8/p-10. Use space-y-8 or larger "
            "between sections. Cramped UI is a guaranteed failure."
        )
    if "cta" in name_l:
        return (
            f"CTA CLARITY IS WEAK ({score}/100). You MUST identify the single most "
            "important action and make it visually dominant: larger size, solid colored "
            "background, prominent placement (top-right of header or hero). Demote ALL "
            "other actions to text-only or outlined buttons."
        )
    if "component" in name_l:
        return (
            f"COMPONENT QUALITY IS WEAK ({score}/100). You MUST replace bare HTML "
            "elements with proper styled components: cards with rounded-2xl + border + "
            "shadow-sm, buttons with px-6 py-3 + bg + rounded-lg, lists with dividers "
            "and proper row layouts."
        )
    if "density" in name_l or "information" in name_l:
        return (
            f"INFORMATION DENSITY IS WEAK ({score}/100). You MUST add breathing room "
            "and group related items. Split walls of content into distinct sections "
            "with headers. Remove any non-essential decoration."
        )
    return f"{name} is weak ({score}/100). Apply aggressive improvements in this dimension."


def build_structural_transform_prompt(
    target_code: str,
    target_path: str,
    supporting_files: str,
    evaluation: dict,
    design_intelligence: dict,
    user_intent: str = "",
    is_retry: bool = False,
    attempt_number: int = 1,
) -> str:
    score = evaluation.get("score", 50)
    issues = evaluation.get("issues", [])
    reasoning = evaluation.get("reasoning", "")
    breakdown = evaluation.get("breakdown", {})

    # Score-driven targeting: surface the weakest sub-dimensions as imperatives
    weakest = _compute_weakest_dimensions(breakdown)
    weak_dims = [(n, s) for n, s in weakest if s < 95]
    if weak_dims:
        directives = "\n\n".join(_dimension_directive(n, s) for n, s in weak_dims[:4])
        targeted_section = (
            "## DIMENSIONS YOU MUST AGGRESSIVELY FIX\n\n"
            "Every dimension below scored under 95. For each one, the listed change is "
            "MANDATORY — not optional. Skipping any of these will cause the transform "
            "to be rejected.\n\n"
            f"{directives}"
        )
    else:
        targeted_section = (
            "## DIMENSIONS YOU MUST AGGRESSIVELY FIX\n\n"
            "All sub-dimensions scored above 95 — but the overall page still scored "
            f"{score}/100, so general improvements are still needed across layout, "
            "hierarchy, spacing, and CTA prominence."
        )

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
        issues_text = "  No specific issues identified — apply aggressive general improvements."

    breakdown_text = ""
    if breakdown:
        breakdown_text = "\n".join(
            f"  - {k.replace('_', ' ').title()}: {v}/100"
            for k, v in breakdown.items()
        )

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
        retry_warning = f"""
## ⚠️ CRITICAL RETRY — ATTEMPT {attempt_number}

Your PREVIOUS attempt was REJECTED because the before and after looked too similar.
A non-technical user could not tell the page had changed.

This time you MUST go further:
- Add NEW JSX wrapper elements (header, main, section, aside) that DID NOT exist before
- Reorganize children into NEW grid/flex containers
- Move existing components into NEW logical groupings
- Change which element is the visually dominant one on the page

Minimum bar to pass validation:
- At least 20 added/removed JSX tags vs the original
- At least 30 lines of structural difference (not just className tweaks)

If you make only style/className changes again, you will be REJECTED again
and the user will see NOTHING. Be aggressive. Restructure.
"""

    return f"""{retry_warning}You are a senior UI engineer performing an AGGRESSIVE structural UI transformation.

# YOUR #1 GOAL

The before and after must look DRAMATICALLY different. If a non-technical user
cannot instantly see the improvement in under 1 second from a thumbnail-sized
screenshot, you have FAILED.

You are NOT polishing. You are REBUILDING the visual structure of this page.
The same data, the same logic, the same handlers — but a completely redesigned
presentation layer.

It is FAR better to over-improve than to under-improve. Minimal edits are worthless.

---

## QUALITY EVALUATION (this page scored {score}/100)

### Overall Assessment
{reasoning}

### Score Breakdown
{breakdown_text}

### Specific Issues to Fix
{issues_text}

---

{targeted_section}

---

## MANDATORY TRANSFORMATIONS (apply ALL six)

You MUST do every one of these. Each is a separate requirement; none are optional.

### 1. LAYOUT RESTRUCTURING
- Enforce a clean grid system. If the page is a flat column of elements, convert
  to a multi-section layout with a grid (e.g. `grid grid-cols-1 md:grid-cols-3`)
- Wrap sections in semantic containers: `<header>`, `<main>`, `<section>`, `<aside>`
- Center major content with `max-w-7xl mx-auto` (or similar) — no edge-to-edge sprawl
- Group related components into card containers with borders and backgrounds
- Add consistent vertical rhythm between sections (`space-y-8` or larger)

### 2. SPACING NORMALIZATION
- Use ONLY the spacing scale: 8, 16, 24, 32, 48, 64 (Tailwind: 2, 4, 6, 8, 12, 16)
- Replace cramped padding (p-2, p-3, p-4) with generous padding (p-6, p-8, p-10)
- Add gaps between cards/items (`gap-6` minimum for grids, `space-y-6` for stacks)
- Card interiors: minimum `p-6`, ideally `p-8`
- Section margins: minimum `py-10`, ideally `py-16`

### 3. HIERARCHY IMPROVEMENT
- Establish ONE clear primary action per page
- Use a strict typographic scale: page title `text-3xl font-bold`, section
  headings `text-lg font-semibold`, body `text-sm`, captions `text-xs`
- Group related content together inside cards with section headers
- Reduce visual competition: only ONE element should dominate at a time

### 4. CTA UPGRADE
- Identify the page's main action (the thing the user is most likely there to do)
- Make it large (`px-6 py-3` minimum), solid-colored, with strong contrast
- Place it above the fold — typically top-right of the header
- DEMOTE all secondary actions to text buttons or outlined buttons
- If you find 3+ buttons of similar weight, you have a competing-CTA problem — fix it

### 5. COMPONENT ENHANCEMENT
- Replace plain HTML elements with styled equivalents
- Buttons: `px-6 py-3 rounded-lg font-semibold` with bg + hover state
- Cards: `bg-white rounded-2xl border border-slate-200 shadow-sm p-6`
- Lists: wrap in a card, add `divide-y` between rows, pad each row
- Inputs: `px-4 py-2.5 border rounded-lg` with focus states
- Stats/numbers: large bold numerals with small uppercase labels above

### 6. CLUTTER REDUCTION
- Remove or hide any UI element that isn't essential to the page's purpose
- Simplify dense areas — split walls of content into distinct sections
- If something can be collapsed, secondary, or contextual, demote it

---

{WORKED_EXAMPLE}

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

## FRAMEWORK-SPECIFIC GUIDANCE

Adapt your transformation to the type of UI:

**Image-heavy / media UIs**: The background media is NOT yours to change — focus
on the OVERLAY components. Make overlay panels larger and more opaque, consolidate
scattered controls into a single glassmorphic panel, increase contrast between
overlay UI and the background.

**Dashboards / admin panels**: Reorganize into a stat-card grid + content cards.
Add a sidebar if missing. Stat cards must have large bold numerals with tiny
uppercase labels above.

**Landing pages**: Restructure into clear full-width sections. Hero gets dramatic
size and a single huge CTA. Feature lists become card grids.

**Forms**: Group fields into logical sections with headers. Add proper labels
and breathing room. Submit button is large and prominent.

---

## CONSTRAINTS (HARD RULES — VIOLATIONS WILL BE REJECTED)

- PRESERVE all imports, exports, hooks, state, event handlers, API calls, business logic
- Same component name, same exports, same props
- Do NOT remove any functionality
- Do NOT add new npm dependencies
- Do NOT rename props, state variables, or handlers
- Use Tailwind classes only (no inline styles unless already present)
- Return the COMPLETE updated file — not a partial snippet, not a diff

---

## SELF-CHECK BEFORE RETURNING (DO THIS)

Before you output, mentally render the new page and ask yourself:

1. "If I showed a non-technical user a thumbnail of before and after, would they
   instantly point at the after and say 'that's better'?"
2. "Did I add at least 5 NEW wrapper elements (sections, cards, grids) that
   weren't in the original?"
3. "Did I demote competing CTAs so there is exactly ONE dominant action?"
4. "Did I at least double the spacing scale used in the original?"
5. "Could I describe the change in one sentence as 'the page is now organized
   into [X], with [Y] as the focal point'?"

If the answer to ANY of these is no, GO BACK and make the transformation more
aggressive before returning.

---

## OUTPUT FORMAT

Return ONLY a JSON object — no markdown fences, no explanation, no preamble.

{{
  "updated_code": "the complete transformed file content",
  "diff_summary": "1 sentence describing the visible structural change",
  "change_annotations": [
    {{
      "region": "section name (e.g. 'Header area', 'Stat grid', 'Content cards')",
      "change_type": "layout|hierarchy|spacing|cta|component|clutter",
      "description": "What changed visually",
      "ux_impact": "Why it's better for the user"
    }}
  ],
  "change_summary": [
    "Plain English description of a visible improvement"
  ]
}}

LANGUAGE RULES for all text fields:
- Write for a product manager, not a developer
- NEVER mention: className, div, span, CSS, px, rem, Tailwind, utility classes
- Focus on WHAT THE USER SEES on screen
"""
