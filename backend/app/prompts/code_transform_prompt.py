import json


def build_code_analysis_prompt(files_summary: str, focus: str = "") -> str:
    focus_line = f"\nThe user wants to focus on: {focus}" if focus else ""
    return f"""You are a senior frontend architect. Analyze the following codebase and identify its structure.

## Codebase Files
{files_summary}
{focus_line}

## Instructions

Return a JSON object with this exact structure:
{{
  "entry_points": ["list of main page/entry files like page.tsx, index.tsx"],
  "layout_files": ["list of layout/wrapper files"],
  "components": [
    {{
      "name": "ComponentName",
      "file_path": "path/to/file.tsx",
      "type": "page|layout|component|config|style",
      "description": "What this component does in 1 sentence",
      "imports": ["list of local imports this file uses"],
      "exports": ["list of exports from this file"]
    }}
  ],
  "dependency_map": {{
    "path/to/file.tsx": ["path/to/imported_file.tsx", "..."]
  }},
  "recommended_target": "path/to/the/primary/file/to/refactor.tsx",
  "target_reason": "Why this file is the best target for UI improvements"
}}

Rules:
- Only include frontend UI files (TSX, JSX, CSS, Tailwind config)
- Skip node_modules, test files, and non-UI config
- The recommended_target should be the most impactful single file to improve
- Focus on the main visible UI surface (landing page, dashboard, hero section)
- Return ONLY valid JSON — no markdown fences, no explanation"""


def build_code_transform_prompt(
    target_code: str,
    target_path: str,
    supporting_files: str,
    design_intelligence: dict,
    user_intent: str = "",
) -> str:
    intent_line = f"\n## User Intent\n{user_intent}" if user_intent else ""

    recommendations = design_intelligence.get("recommendations", [])
    design_tokens = design_intelligence.get("design_tokens", {})
    global_patterns = design_intelligence.get("global_patterns", {})
    components = design_intelligence.get("components", {})
    avoid = design_intelligence.get("avoid", [])

    return f"""You are a senior UI engineer performing an AGGRESSIVE UI transformation.

YOUR #1 GOAL: The before and after must look DRAMATICALLY different.
If a user cannot instantly see the improvement in under 1 second, you have FAILED.

## TARGET FILE: {target_path}
```tsx
{target_code}
```

## SUPPORTING FILES (for context — do NOT modify these)
{supporting_files}

## DESIGN INTELLIGENCE (from competitor analysis)

### Design Tokens
{json.dumps(design_tokens, indent=2)}

### Global Patterns to Apply
{json.dumps(global_patterns, indent=2)}

### Component Patterns
{json.dumps(components, indent=2)}

### Recommendations (ordered by priority)
{json.dumps(recommendations, indent=2)}

### Anti-Patterns to AVOID
{json.dumps(avoid, indent=2)}
{intent_line}

---

## TRANSFORMATION PHILOSOPHY

You are NOT polishing. You are REBUILDING the UI.
The logic stays. The UI gets a complete makeover.
Subtle changes are worthless — the user is paying for a visible transformation.

## MANDATORY CHANGES (do ALL of these)

### 1. LAYOUT OVERHAUL (most important)
- Restructure the entire page layout — do NOT preserve the original structure
- If single column → make it multi-column, card grid, or dashboard layout
- Add wrapper cards/panels to group related content
- Introduce clear visual sections with distinct backgrounds
- Use modern patterns: dashboard grids, bento layouts, split panels

### 2. VISUAL HIERARCHY REDESIGN
- Make primary actions 3x more prominent
- Add clear section headings with proper typographic scale
- Create obvious weight differences between primary/secondary/tertiary
- Remove visual noise

### 3. COMPONENT UPGRADES
- Replace basic buttons with properly sized, styled buttons
- Turn flat lists into card grids with padding, borders, hover states
- Upgrade nav elements with active states and clear hierarchy

### 4. SPACING REVOLUTION
- Double the padding inside containers
- Add generous gaps between sections (minimum gap-6)
- The #1 sign of amateur UI is cramped layouts — add breathing room

### 5. VISUAL POLISH
- Apply consistent color system from design tokens
- Add subtle borders to separate sections
- Use background variations for depth
- Consistent rounded corners and shadows

## HANDLING DIFFERENT FRONTEND TYPES

Adapt your strategy to what you're transforming:

- **Image-heavy UIs** (media players, games, creative tools): Focus on OVERLAY components. Make panels larger, higher opacity, stronger glassmorphism. Consolidate scattered controls into unified panels. The image stays — the UI on top of it gets dramatically better.
- **Dashboards**: Reorganize into grid cards, add sidebar, create stat cards with large numbers.
- **Landing pages**: Full-width sections, dramatic hero, prominent CTA, 64px+ section spacing.
- **Forms**: Add grouping, labels, spacing. Split into logical sections.
- **SPAs**: Add navigation structure, clear content areas, breadcrumbs.

## WHAT "DRAMATICALLY DIFFERENT" MEANS

GOOD (visible at a glance):
- Single column → card grid
- Flat page → sectioned dashboard
- Cramped → spacious with clear sections
- Basic form → styled form with proper spacing
- Scattered overlays on image → consolidated glassmorphic panel

BAD (too subtle):
- Only changed colors
- Only adjusted padding slightly
- Layout structure stayed the same

## CONSTRAINTS
- PRESERVE all imports, exports, hooks, state, event handlers, business logic
- DO NOT remove functionality
- DO NOT rename props or state variables
- DO NOT add new npm dependencies
- KEEP component names and file exports
- Return the COMPLETE updated file
- Use Tailwind classes

## OUTPUT FORMAT

Return a JSON object with this exact structure:
{{
  "updated_code": "the complete transformed file content",
  "diff_summary": "1 sentence describing the visible change",
  "change_annotations": [
    {{
      "region": "section name",
      "change_type": "flow|layout|spacing|component|visual",
      "description": "What changed visually",
      "ux_impact": "Why it's better for the user"
    }}
  ],
  "change_summary": [
    "Plain English description of a visible improvement"
  ]
}}

LANGUAGE RULES:
- Write for a product manager, not a developer
- NEVER mention: className, div, span, CSS, px, rem, Tailwind
- Focus on WHAT THE USER SEES

Return ONLY valid JSON — no markdown fences, no explanation."""
