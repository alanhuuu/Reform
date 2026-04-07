"""
Transformation prompt that enforces DRAMATIC, VISIBLE structural changes.
The before/after must be obviously different at a glance.
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
        retry_warning = """
## CRITICAL RETRY WARNING

Your PREVIOUS attempt was REJECTED because the before and after looked too similar.
The user could not see a meaningful difference.

This time you MUST make DRAMATIC changes:
- Completely reorganize the page layout
- Introduce new section groupings, cards, grids
- Change the spatial composition of the entire page
- Make the difference visible in a THUMBNAIL

If you play it safe again → this will be REJECTED again.
"""

    return f"""{retry_warning}You are a senior UI engineer performing an AGGRESSIVE UI transformation.

YOUR #1 GOAL: The before and after must look DRAMATICALLY different.
If a user cannot instantly see the improvement in under 1 second, you have FAILED.

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

## TRANSFORMATION PHILOSOPHY

You are NOT polishing. You are REBUILDING the UI.

Think of this as: "the same app, redesigned by a world-class design team."
The logic stays. The UI gets a complete makeover.

The user is paying for a transformation they can SEE. Subtle changes are worthless.

## MANDATORY CHANGES (you MUST do ALL of these)

### 1. LAYOUT OVERHAUL (most important)
- Restructure the entire page layout — do NOT preserve the original grid/flex structure
- If content is in a single column, make it multi-column or card-based
- If content is cramped, add generous whitespace and section breaks
- Introduce clear visual sections: hero/header area, content area, sidebar, footer
- Add wrapper cards/panels to group related content with borders and backgrounds
- Use modern patterns: dashboard grids, bento layouts, split panels

### 2. VISUAL HIERARCHY REDESIGN
- Make the primary action 3x more prominent (bigger, bolder, better placed)
- Add clear section headings with proper typographic scale
- Create obvious visual weight differences between primary, secondary, tertiary content
- Remove visual noise — if something isn't essential, dim it or remove it
- Add visual anchors: icons, status badges, colored accents on key elements

### 3. COMPONENT UPGRADES
- Replace basic buttons with properly sized, styled, prominent buttons
- Turn flat lists into card grids with padding, borders, and hover states
- Add proper input styling with labels, focus states, and spacing
- Upgrade nav elements with active states, icons, and clear hierarchy
- Add empty states, loading states, or placeholder content where appropriate

### 4. SPACING REVOLUTION
- Double the padding inside containers (if it was p-4, make it p-8)
- Add generous gaps between sections (minimum gap-6 between major sections)
- Ensure consistent spacing scale throughout (4, 8, 12, 16, 24, 32, 48)
- Add breathing room — the #1 sign of amateur UI is cramped layouts

### 5. VISUAL POLISH
- Apply a consistent color system from the design tokens
- Add subtle borders (1px, low opacity) to separate sections
- Use background color variations to create depth (surface vs background)
- Add rounded corners consistently (rounded-lg or rounded-xl)
- Apply subtle shadows on elevated elements (cards, modals, dropdowns)

## HANDLING DIFFERENT FRONTEND TYPES

Adapt your transformation strategy to the type of UI:

### Image-heavy / media UIs (games, creative tools, media players)
- The background image/video is NOT yours to change — focus on the OVERLAY components
- Make overlay cards/panels LARGER, more prominent, with stronger backgrounds (higher opacity)
- Increase the contrast between overlay elements and the background
- Restructure the layout of overlays — reposition them, group them into panels
- Add glassmorphism with stronger blur/opacity so UI elements stand out
- Make buttons and controls significantly bigger and more visible
- If controls are scattered, consolidate them into a unified control panel

### Dashboards / admin panels
- Reorganize into clear grid sections with cards
- Add a proper sidebar if one doesn't exist
- Create stat cards with large numbers and labels
- Add visual hierarchy between primary metrics and secondary data

### Landing pages / marketing sites
- Restructure into clear full-width sections
- Make the hero dramatically bigger with prominent CTA
- Add proper spacing between sections (64px+)
- Upgrade feature sections from lists to card grids

### Forms / data entry
- Add proper labels, spacing, and grouping
- Split long forms into logical sections with headers
- Make submit buttons prominent and properly placed
- Add visual feedback states

### Single-page apps (SPAs)
- Add proper navigation structure
- Create clear content areas with boundaries
- Add breadcrumbs or progress indicators where appropriate

## WHAT "DRAMATICALLY DIFFERENT" MEANS

GOOD transformation (visible at a glance):
- Single column list → card grid layout
- Flat page → sectioned dashboard with sidebar
- Basic form → multi-step wizard with progress
- Plain text list → rich cards with icons and metadata
- Cramped layout → spacious layout with clear sections
- Small scattered overlays → consolidated prominent panels
- Tiny controls on image → large glassmorphic control panel

BAD transformation (too subtle):
- Only changed colors/fonts
- Only adjusted padding by a few pixels
- Only added shadows or borders
- Layout structure stayed the same
- User would struggle to spot the difference

## CONSTRAINTS
- PRESERVE all imports, exports, hooks, state, event handlers, and business logic
- DO NOT remove any functionality
- DO NOT rename props or state variables
- DO NOT add new npm dependencies
- KEEP the same component names and file exports
- Return the COMPLETE updated file — not a partial snippet
- Use Tailwind classes

## OUTPUT FORMAT

Return a JSON object with this exact structure:
{{
  "updated_code": "the complete transformed file content",
  "diff_summary": "1 sentence describing the visible change",
  "change_annotations": [
    {{
      "region": "section name (e.g. 'Header area', 'Main content')",
      "change_type": "flow|layout|spacing|component|visual",
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
- NEVER mention: className, div, span, CSS, px, rem, Tailwind, utility
- Focus on WHAT THE USER SEES

Return ONLY valid JSON — no markdown fences, no explanation."""
