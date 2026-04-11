"""Edit Lab service.

Loads the current (untransformed) website from a GitHub repo, detects
selectable sections on the rendered page, and applies section-scoped AI edits
to the source. Uses a persistent workspace (edit_lab_workspace) so repeated
edits in one session skip the clone/install/boot cycle.
"""

from __future__ import annotations

import asyncio
import base64
import logging
import os
import re
from typing import Any, Optional

import anthropic

from app.services.anthropic_errors import (
    classify_anthropic_error,
    is_anthropic_exception,
    log_and_classify,
)
from app.services.edit_lab_workspace import (
    EditLabSession,
    create_session,
    get_registry,
)
from app.services.page_discovery import discover_pages

logger = logging.getLogger(__name__)


SECTION_DETECTION_SCRIPT = r"""
() => {
  // Three-tier detection so dashboards with lots of non-semantic markup
  // still produce selectable targets for drag-rectangle selection.
  //
  //   Tier 1 (semantic): the classic six landmark/structural tags.
  //   Tier 2 (content):  forms, tables, articles, lists, figures and any
  //                      div with a class hint suggesting it's a card /
  //                      panel / widget / group / stats block.
  //   Tier 3 (interactive): buttons, anchors, and role="button" elements
  //                      so small action targets still get a hit-box.
  const primarySelector = 'header, nav, main > *, section, footer, aside, article, form, figure, [data-section]';
  const contentClassHints = /\b(card|panel|widget|stats?|metric|tile|box|group|grid|shelf|toolbar|banner|hero|feature|cta|footer|header|sidebar)\b/i;
  const seen = new Set();
  const candidates = [];

  const pushCandidate = (el, tierMinW, tierMinH) => {
    if (seen.has(el)) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < tierMinW || rect.height < tierMinH) return;
    seen.add(el);
    candidates.push({ el, rect });
  };

  document.querySelectorAll(primarySelector).forEach(el => pushCandidate(el, 120, 60));

  document.querySelectorAll('form, table, ul, ol, figure, article').forEach(el => pushCandidate(el, 100, 48));

  document.querySelectorAll('div, section').forEach(el => {
    const cls = (el.className && el.className.toString ? el.className.toString() : '');
    if (cls && contentClassHints.test(cls)) pushCandidate(el, 100, 48);
  });

  document.querySelectorAll('button, a[href], [role="button"], [role="navigation"], input[type="submit"]').forEach(el => pushCandidate(el, 40, 20));

  const sections = [];
  candidates.forEach((c, idx) => {
    const el = c.el;
    const rect = c.rect;
    const abs = {
      x: Math.round(rect.x + window.scrollX),
      y: Math.round(rect.y + window.scrollY),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };

    const tag = el.tagName.toLowerCase();
    const classAttr = (el.className && el.className.toString ? el.className.toString() : '').toLowerCase();
    const dataSec = el.getAttribute('data-section') || '';
    const ariaLabel = el.getAttribute('aria-label') || '';

    let label = dataSec || ariaLabel;
    if (!label) {
      if (tag === 'button' || (el.getAttribute && el.getAttribute('role') === 'button')) {
        const btnText = (el.textContent || '').trim();
        label = btnText ? btnText.slice(0, 32) : 'Button';
      } else if (tag === 'a') {
        const linkText = (el.textContent || '').trim();
        label = linkText ? linkText.slice(0, 32) : 'Link';
      } else if (tag === 'form') label = 'Form';
      else if (tag === 'table') label = 'Table';
      else if (tag === 'ul' || tag === 'ol') label = 'List';
      else if (tag === 'nav' || classAttr.includes('navbar') || classAttr.includes('menubar')) label = 'Navigation';
      else if (tag === 'header' || classAttr.includes('site-header') || classAttr.includes('page-header')) label = 'Header';
      else if (tag === 'footer' || classAttr.includes('footer')) label = 'Footer';
      else if (tag === 'aside' || classAttr.includes('sidebar')) label = 'Sidebar';
      else if (classAttr.includes('hero') || classAttr.includes('banner')) label = 'Hero';
      else if (classAttr.includes('pricing')) label = 'Pricing';
      else if (classAttr.includes('feature')) label = 'Features';
      else if (classAttr.includes('testimonial')) label = 'Testimonials';
      else if (classAttr.includes('cta')) label = 'Call to Action';
      else if (classAttr.includes('faq')) label = 'FAQ';
      else if (classAttr.includes('stats') || classAttr.includes('metric')) label = 'Stats';
      else if (classAttr.includes('gallery')) label = 'Gallery';
      else if (classAttr.includes('contact')) label = 'Contact';
      else if (classAttr.includes('card')) label = 'Card';
      else if (classAttr.includes('panel')) label = 'Panel';
      else if (classAttr.includes('widget')) label = 'Widget';
      else if (classAttr.includes('grid')) label = 'Grid';
      else if (classAttr.includes('toolbar')) label = 'Toolbar';
      else {
        const h = el.querySelector('h1, h2, h3');
        const headingText = h && h.textContent ? h.textContent.trim() : '';
        if (headingText) label = headingText.slice(0, 40);
        else label = tag.charAt(0).toUpperCase() + tag.slice(1) + ' ' + (idx + 1);
      }
    }

    const headingEl = el.querySelector('h1, h2, h3, h4');
    const heading = headingEl ? (headingEl.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120) : '';
    const paragraphEl = el.querySelector('p');
    const paragraph = paragraphEl ? (paragraphEl.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160) : '';
    const fullText = ((el.textContent || '').trim().replace(/\s+/g, ' ')).slice(0, 280);

    const classesRaw = (el.className && el.className.toString ? el.className.toString() : '').trim().slice(0, 240);
    const role = el.getAttribute('role') || '';
    const elementId = el.getAttribute('id') || '';

    sections.push({
      id: 'section-' + idx,
      tag,
      label: (label || 'Section').slice(0, 48),
      rect: abs,
      heading,
      paragraph,
      text: fullText,
      classes: classesRaw,
      role,
      aria_label: ariaLabel,
      element_id: elementId,
    });
  });

  return {
    sections,
    document_size: {
      width: Math.max(document.documentElement.scrollWidth, window.innerWidth),
      height: Math.max(document.documentElement.scrollHeight, window.innerHeight),
    },
  };
}
"""


_SOURCE_EXTS = (".tsx", ".jsx", ".ts", ".js")
_SKIP_DIRS = {"node_modules", ".next", "dist", "build", ".git", "out", "coverage", ".turbo"}

# Section → file mapping scoring thresholds
_MIN_ACCEPT_SCORE = 40

# Tailwind / utility class prefixes we never treat as meaningful component hints.
_UTIL_CLASS_PREFIXES = (
    "p-", "m-", "px-", "py-", "mx-", "my-", "pt-", "pb-", "pl-", "pr-",
    "mt-", "mb-", "ml-", "mr-", "w-", "h-", "min-", "max-", "text-",
    "bg-", "border-", "rounded-", "gap-", "space-", "flex-", "grid-",
    "items-", "justify-", "content-", "place-", "self-", "order-",
    "col-", "row-", "hover:", "focus:", "active:", "group-", "sm:",
    "md:", "lg:", "xl:", "2xl:", "dark:", "ring-", "shadow-", "opacity-",
    "z-", "overflow-", "top-", "bottom-", "left-", "right-", "inset-",
    "scale-", "rotate-", "translate-", "duration-", "ease-", "transition-",
)
_UTIL_CLASS_EXACT = {
    "flex", "grid", "block", "inline", "inline-block", "hidden", "visible",
    "absolute", "relative", "fixed", "sticky", "static", "container",
    "mono", "italic", "underline", "uppercase", "lowercase", "truncate",
    "whitespace-nowrap", "text-left", "text-center", "text-right",
    "cursor-pointer", "cursor-default",
}


def _distinctive_classes(classes: str) -> list[str]:
    """Keep only component/BEM-ish class names, drop Tailwind utilities."""
    if not classes:
        return []
    out: list[str] = []
    for c in classes.split():
        if not c or len(c) < 4:
            continue
        if c in _UTIL_CLASS_EXACT:
            continue
        if any(c.startswith(p) for p in _UTIL_CLASS_PREFIXES):
            continue
        out.append(c)
        if len(out) >= 6:
            break
    return out


def _score_file_for_section(
    rel_path: str,
    content: str,
    heading: str,
    paragraph: str,
    section_label: str,
    classes: str = "",
    role: str = "",
    aria_label: str = "",
) -> int:
    """Higher = better match. Returns 0 if no signal."""
    if not content:
        return 0
    lower = content.lower()
    score = 0

    if heading and len(heading) >= 6:
        h_lower = heading.lower()
        if h_lower in lower:
            score += 100
            # Strong bonus if the heading sits in a JSX text position
            if f">{h_lower}" in lower or f'"{h_lower}"' in lower or f"'{h_lower}'" in lower:
                score += 50
            # Small bonus if it appears inside a heading tag
            if f">{h_lower}</h" in lower:
                score += 30

    if paragraph and len(paragraph) >= 12:
        p_needle = paragraph[:80].lower()
        if p_needle in lower:
            score += 60

    if section_label:
        label_slug = section_label.replace(" ", "").lower()
        if label_slug and len(label_slug) >= 3:
            path_lower = rel_path.lower()
            if label_slug in path_lower:
                score += 30
            # Label appearing as a component name or class
            if (f"<{label_slug}" in lower or f"class{label_slug}" in lower
                    or f'"{label_slug}"' in lower):
                score += 15

    # Distinctive class names — strong signal that this file renders the section
    for cls in _distinctive_classes(classes):
        cl = cls.lower()
        if cl in lower:
            score += 20
            if (f'classname="{cl}' in lower or f"classname='{cl}" in lower
                    or f'"{cl}"' in lower or f"'{cl}'" in lower):
                score += 30
        # Filename match for component-like class names
        if cl in rel_path.lower():
            score += 15

    if aria_label and len(aria_label) >= 4:
        al = aria_label.lower()
        if al in lower:
            score += 45

    if role and len(role) >= 4 and role not in ("button", "link", "text"):
        rl = role.lower()
        if f'role="{rl}"' in lower or f"role='{rl}'" in lower:
            score += 30

    # Penalize files that are clearly not source components
    if rel_path.endswith((".test.tsx", ".test.jsx", ".test.ts", ".test.js",
                         ".stories.tsx", ".stories.jsx", ".spec.ts", ".spec.tsx")):
        score = max(0, score - 60)

    return score


def _find_best_source_file(
    frontend_dir: str,
    heading: str,
    paragraph: str,
    section_label: str,
    classes: str,
    role: str,
    aria_label: str,
    fallback: Optional[str],
) -> Optional[str]:
    """Rank candidate source files and return the highest-scoring one."""
    has_any_signal = any([heading, paragraph, section_label, classes, role, aria_label])
    if not has_any_signal:
        return fallback

    best_score = 0
    best_path: Optional[str] = None
    best_path_len = 0

    for root, dirs, files in os.walk(frontend_dir):
        dirs[:] = [d for d in dirs if d not in _SKIP_DIRS and not d.startswith(".")]
        for fname in files:
            if not fname.endswith(_SOURCE_EXTS):
                continue
            fpath = os.path.join(root, fname)
            try:
                with open(fpath, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read()
            except Exception:
                continue
            rel = os.path.relpath(fpath, frontend_dir)
            score = _score_file_for_section(
                rel, content, heading, paragraph, section_label,
                classes=classes, role=role, aria_label=aria_label,
            )
            if score <= 0:
                continue
            if score > best_score or (score == best_score and (best_path_len == 0 or len(rel) < best_path_len)):
                best_score = score
                best_path = rel
                best_path_len = len(rel)

    if best_score >= _MIN_ACCEPT_SCORE:
        return best_path
    return fallback


def _assign_source_files(
    sections: list[dict[str, Any]],
    frontend_dir: str,
    fallback: Optional[str],
) -> None:
    """Mutate sections in place, filling in `source_file` via scored lookup."""
    for sec in sections:
        sec["source_file"] = _find_best_source_file(
            frontend_dir,
            heading=sec.get("heading") or "",
            paragraph=sec.get("paragraph") or "",
            section_label=sec.get("label") or "",
            classes=sec.get("classes") or "",
            role=sec.get("role") or "",
            aria_label=sec.get("aria_label") or "",
            fallback=fallback,
        )


_PROMPT_STOPWORDS = {
    "the", "a", "an", "to", "into", "from", "with", "and", "or", "of",
    "in", "on", "at", "this", "that", "these", "those", "it", "its",
    "change", "rename", "replace", "update", "make", "set", "move", "add",
    "remove", "delete", "edit", "modify", "switch", "turn", "fix", "adjust",
    "improve", "refine", "simplify", "cleanup", "clean", "polish", "tweak",
    "word", "words", "text", "label", "button", "section", "block", "area",
    "more", "less", "bigger", "smaller", "larger", "modern", "old", "new",
    "please", "just", "now", "very", "really",
}


def _extract_prompt_anchors(prompt: str) -> list[str]:
    """Pull literal strings the user most likely wants the edit to touch.

    Feeds two things:
      1. Repo text search → the file that actually contains the string wins
         the target over whatever source_file the frontend picked.
      2. A "Literal strings to find and modify" line in the Claude prompt so
         the model has concrete anchors to look for in the file.
    """
    if not prompt:
        return []
    anchors: list[str] = []

    # Quoted strings — strongest signal
    anchors.extend(re.findall(r'"([^"]{2,60})"', prompt))
    anchors.extend(re.findall(r"'([^']{2,60})'", prompt))

    # "change X to Y" / "rename A to B" / "replace A with B"
    for verb in ("change", "rename", "replace"):
        for m in re.finditer(
            rf"\b{verb}\s+(?:the\s+word\s+)?([A-Za-z][A-Za-z0-9_\- ]{{1,40}}?)\s+(?:to|with|into)\b",
            prompt,
            flags=re.IGNORECASE,
        ):
            anchors.append(m.group(1))
            # Also capture the replacement target so we avoid mis-searching for it later
        # "... to Y" — grab Y as a second anchor
        for m in re.finditer(
            rf"\b{verb}\b.*?\b(?:to|with|into)\s+([A-Za-z][A-Za-z0-9_\- ]{{1,40}})",
            prompt,
            flags=re.IGNORECASE,
        ):
            anchors.append(m.group(1))

    # "word X" patterns
    anchors.extend(re.findall(r"\bword\s+([A-Za-z][A-Za-z0-9_\-]{1,40})\b", prompt, flags=re.IGNORECASE))

    # Capitalized standalone words (likely proper nouns like brand names)
    for tok in re.findall(r"\b([A-Z][A-Za-z0-9]{2,})\b", prompt):
        anchors.append(tok)

    # Clean up: strip, dedup case-insensitively, drop stopwords
    seen: set[str] = set()
    out: list[str] = []
    for raw in anchors:
        a = raw.strip().strip('.,;:!?"\'')
        if not a or len(a) < 3:
            continue
        low = a.lower()
        if low in _PROMPT_STOPWORDS:
            continue
        # Skip very common short words even if Capitalized
        if low in seen:
            continue
        seen.add(low)
        out.append(a)
        if len(out) >= 6:
            break
    return out


def _find_best_file_for_anchors(
    frontend_dir: str,
    anchors: list[str],
    current_target: Optional[str],
) -> Optional[str]:
    """Rank source files by how many prompt anchors they literally contain.

    Returns a file path relative to frontend_dir if it's a strictly better
    match than `current_target`, otherwise None. This is the mechanism that
    lets "change the word acme to hamza" retarget the edit from the page
    root file (which only imports <Sidebar />) to components/Sidebar.tsx
    (which actually contains the literal `Acme`).
    """
    if not anchors:
        return None

    needles = [a.lower() for a in anchors if len(a) >= 3]
    if not needles:
        return None

    best_score = 0
    best_path: Optional[str] = None

    for root, dirs, files in os.walk(frontend_dir):
        dirs[:] = [d for d in dirs if d not in _SKIP_DIRS and not d.startswith(".")]
        for fname in files:
            if not fname.endswith(_SOURCE_EXTS):
                continue
            fpath = os.path.join(root, fname)
            try:
                with open(fpath, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read()
            except Exception:
                continue
            lower = content.lower()
            score = 0
            for n in needles:
                count = lower.count(n)
                if count == 0:
                    continue
                score += 50 + min(count, 5) * 10
                # Extra credit if the string appears inside a JSX text node
                if f">{n}" in lower or f' "{n}"' in lower or f" '{n}'" in lower:
                    score += 30
            if score == 0:
                continue
            rel = os.path.relpath(fpath, frontend_dir)
            # Penalize test / story files
            if rel.endswith((".test.tsx", ".test.jsx", ".test.ts", ".test.js",
                             ".stories.tsx", ".stories.jsx", ".spec.ts", ".spec.tsx")):
                score = max(0, score - 100)
            if score > best_score:
                best_score = score
                best_path = rel

    if best_score >= 60 and best_path and best_path != current_target:
        return best_path
    return None


def _build_discovery_inputs_from_disk(frontend_dir: str) -> tuple[list[dict], list[str]]:
    """Walk the cloned workspace and build (files, file_tree) inputs that match
    the shape `page_discovery.discover_pages` expects."""
    files: list[dict] = []
    file_tree: list[str] = []
    for root, dirs, fnames in os.walk(frontend_dir):
        dirs[:] = [d for d in dirs if d not in _SKIP_DIRS and not d.startswith(".")]
        for fname in fnames:
            if not fname.endswith(_SOURCE_EXTS):
                continue
            full = os.path.join(root, fname)
            rel = os.path.relpath(full, frontend_dir).replace(os.sep, "/")
            file_tree.append(rel)
            try:
                with open(full, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read()
            except Exception:
                content = ""
            files.append({"path": rel, "content": content, "size": len(content)})
    return files, file_tree


def _discover_available_pages(sess: EditLabSession) -> list[dict]:
    """Return a list of {name, route, path} dicts for every discoverable page
    in the session's workspace, using the shared page_discovery logic.
    Side-effect: populates `sess.page_file_by_route` for navigate lookups."""
    try:
        files, file_tree = _build_discovery_inputs_from_disk(sess.frontend_dir)
        discovered, _framework, _deps = discover_pages(files, file_tree)
    except Exception as e:
        logger.warning("Edit Lab: page discovery failed: %s", e)
        discovered = []

    available: list[dict] = []
    seen_routes: set[str] = set()
    for p in discovered:
        if p.route in seen_routes:
            continue
        seen_routes.add(p.route)
        available.append({"name": p.name, "route": p.route, "path": p.path})
        sess.page_file_by_route[p.route] = p.path

    # Always guarantee Home at "/"
    if not any(p["route"] == "/" for p in available):
        home = {"name": "Home", "route": "/", "path": sess.root_file or ""}
        available.insert(0, home)
        if sess.root_file:
            sess.page_file_by_route["/"] = sess.root_file

    available.sort(key=lambda p: (p["route"] != "/", p["route"]))
    return available


async def _playwright_collect(url: str) -> tuple[str, dict]:
    """Navigate to URL, return (full_page_screenshot_b64, detection_payload)."""
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        try:
            await page.goto(url, wait_until="networkidle", timeout=30000)
            await page.wait_for_timeout(1500)
            detection = await page.evaluate(SECTION_DETECTION_SCRIPT)
            screenshot = await page.screenshot(type="png", full_page=True)
            return base64.b64encode(screenshot).decode("utf-8"), detection
        finally:
            await browser.close()


async def load_current_preview(
    github_url: str,
    branch: str = "main",
    access_token: str = "",
) -> dict:
    """Create a persistent workspace, render the root page, return payload + session_id."""
    if not github_url:
        return {"error": "No repository URL provided."}

    registry = get_registry()
    registry.sweep()

    try:
        sess = await asyncio.to_thread(create_session, github_url, branch, access_token)
    except Exception as e:
        logger.error("Edit Lab load: create_session failed: %s", e, exc_info=True)
        return {"error": f"Workspace setup failed: {e}"}

    try:
        root_code = ""
        if sess.root_file:
            try:
                with open(os.path.join(sess.frontend_dir, sess.root_file), "r", encoding="utf-8") as f:
                    root_code = f.read()
            except Exception as e:
                logger.warning("Edit Lab: could not read root file: %s", e)

        available_pages = _discover_available_pages(sess)

        logger.info("Edit Lab: rendering session %s at %s", sess.id, sess.base_url)
        screenshot_b64, detection = await _playwright_collect(sess.base_url)
        sections = detection.get("sections", []) or []
        document_size = detection.get("document_size", {"width": 1440, "height": 900})

        page_file_for_root = sess.page_file_by_route.get("/", sess.root_file)
        _assign_source_files(sections, sess.frontend_dir, page_file_for_root)

        return {
            "session_id": sess.id,
            "screenshot": screenshot_b64,
            "sections": sections,
            "document_size": document_size,
            "root_file": sess.root_file,
            "root_code": root_code,
            "framework": sess.framework,
            "available_pages": available_pages,
            "current_page": "/",
        }
    except Exception as e:
        logger.error("Edit Lab load failed: %s", e, exc_info=True)
        # Session is still alive — leave it in the registry, the client can retry render
        return {"session_id": sess.id, "error": f"Render failed: {e}"}


def _normalize_page_path(page_path: str) -> str:
    """Sanitize a user-supplied route. Returns '/' for empty input."""
    if not page_path:
        return "/"
    path = page_path.strip()
    if not path.startswith("/"):
        path = "/" + path
    # Strip query/fragment and reject traversal
    path = path.split("#", 1)[0].split("?", 1)[0]
    if ".." in path:
        return "/"
    return path or "/"


async def navigate_to_page(session_id: str, page_path: str) -> dict:
    """Navigate the warm dev server to a new route and re-detect sections.
    Reuses the existing workspace — no clone, install, or server restart."""
    if not session_id:
        return {"error": "Missing session_id. Please reload the preview.", "session_expired": True}

    registry = get_registry()
    registry.sweep()
    sess = registry.get(session_id)
    if not sess:
        return {"error": "Edit Lab session expired. Reloading preview…", "session_expired": True}

    normalized = _normalize_page_path(page_path)
    url = sess.base_url.rstrip("/") + normalized

    try:
        logger.info("Edit Lab: navigating session %s to %s", sess.id, url)
        screenshot_b64, detection = await _playwright_collect(url)
        sections = detection.get("sections", []) or []
        document_size = detection.get("document_size", {"width": 1440, "height": 900})

        page_file = sess.page_file_by_route.get(normalized) or sess.root_file
        _assign_source_files(sections, sess.frontend_dir, page_file)

        sess.touch()
        return {
            "session_id": sess.id,
            "screenshot": screenshot_b64,
            "sections": sections,
            "document_size": document_size,
            "current_page": normalized,
            "target_page_file": page_file,
        }
    except Exception as e:
        logger.error("Edit Lab navigate failed: %s", e, exc_info=True)
        return {"session_id": sess.id, "error": f"Navigate failed: {e}"}


def _build_scoped_prompt(
    current_code: str,
    section_label: str,
    section_heading: str,
    section_paragraph: str,
    section_text: str,
    section_tag: str,
    section_classes: str,
    section_role: str,
    section_aria_label: str,
    user_prompt: str,
    prompt_anchors: Optional[list[str]] = None,
) -> str:
    identifier_lines = [f'- Label: "{section_label}"']
    if section_tag:
        identifier_lines.append(f"- HTML tag: <{section_tag}>")
    if section_aria_label:
        identifier_lines.append(f'- aria-label: "{section_aria_label}"')
    if section_role:
        identifier_lines.append(f'- role: "{section_role}"')
    distinctive = _distinctive_classes(section_classes)
    if distinctive:
        identifier_lines.append(f'- CSS class names to match: {" ".join(distinctive)}')
    if section_heading:
        identifier_lines.append(f'- Heading text: "{section_heading}"')
    if section_paragraph:
        identifier_lines.append(f'- Paragraph snippet: "{section_paragraph}"')
    if section_text and not (section_heading or section_paragraph):
        identifier_lines.append(f'- Visible text: "{section_text[:160]}"')
    if prompt_anchors:
        identifier_lines.append(
            "- Literal strings from the user's prompt to find and modify: "
            + ", ".join(f'"{a}"' for a in prompt_anchors)
        )
    identifier = "\n".join(identifier_lines)

    return f"""You are a senior frontend engineer editing a single React/JSX file.

## File to modify
{current_code}

## The user has selected ONE region of the rendered page
Identify the JSX that renders the element described below. Match by ANY available signal — tag, class names, aria-label, role, or visible text:
{identifier}

## User's requested change for that region
"{user_prompt}"

---

## HOW TO SCOPE THE EDIT
- Your primary target is the JSX element identified above.
- If the user's change is inherently container-level — background, padding, margin, border, corner radius, layout direction, gap, alignment, size (bigger/smaller), font-size, text color — you MAY modify the className or style of the identified element AND any descendants of the identified region that the user clearly means. "Make this button bigger" = find the button(s) in the region and add a bigger size class (`text-lg`, `px-6 py-3`, `h-12`, etc.).
- If the user's change is content-level — copy, headings, button labels — modify only the matching text.
- Never modify JSX that sits outside the identified element's direct wrapping container. Never modify imports or exports unless the change strictly requires it (e.g. a new Tailwind class is added — that needs no import).

## CRITICAL RULES
1. **The change MUST be visibly different when the page re-renders.** If the user asks for "bigger", at least DOUBLE the padding or font-size. If they ask for "white background", use `bg-white` (not `bg-gray-50`). Subtle tweaks defeat the purpose — be obvious.
2. Do not return an unchanged file. Do not make a tiny invisible change. If the prompt is ambiguous, pick the most impactful visible interpretation.
3. If the element's JSX is imported from another file (i.e. this file only renders `<SomeComponent />`), replace that usage inline in THIS file with JSX that achieves the user's change rather than editing any other file. Inline JSX beats unreachable edits.
4. When the user mentions color/background/border/spacing/size, apply it via Tailwind classes (e.g. `bg-white`, `border-gray-200`, `p-6`, `text-2xl`, `h-14`) if the surrounding code uses Tailwind. Otherwise match the styling convention already present in the file (inline style, CSS modules, etc.).
5. Preserve all imports, exports, hooks, state, event handlers, and unrelated markup.
6. Return the COMPLETE updated file — not a diff, not a snippet.
7. Return ONLY code — no explanation, no markdown fences, no commentary.
8. Start with the first line of the original file (import, 'use client', or similar)."""


def _extract_code_response(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:])
        if text.endswith("```"):
            text = text[: text.rfind("```")].strip()
    return text


def _match_updated_section(
    old_label: str,
    old_heading: str,
    old_paragraph: str,
    new_sections: list[dict[str, Any]],
) -> Optional[str]:
    """Return the id of the new section that corresponds to the old selection."""
    if not new_sections:
        return None
    old_h = (old_heading or "").strip().lower()
    old_p = (old_paragraph or "").strip()[:60].lower()
    old_l = (old_label or "").strip().lower()

    if old_h and len(old_h) >= 4:
        for sec in new_sections:
            h = (sec.get("heading") or "").strip().lower()
            if h == old_h:
                return sec.get("id")
        for sec in new_sections:
            h = (sec.get("heading") or "").strip().lower()
            if h and len(old_h) >= 6 and (old_h in h or h in old_h):
                return sec.get("id")

    if old_p and len(old_p) >= 10:
        for sec in new_sections:
            p = (sec.get("paragraph") or "").strip()[:60].lower()
            if p and (p[:30] == old_p[:30] or p in old_p or old_p in p):
                return sec.get("id")

    if old_l:
        for sec in new_sections:
            if (sec.get("label") or "").strip().lower() == old_l:
                return sec.get("id")
    return None


def _locate_target_file(sess: EditLabSession, target_file: str) -> Optional[str]:
    direct = os.path.join(sess.frontend_dir, target_file)
    if os.path.isfile(direct):
        return direct
    for root, dirs, files in os.walk(sess.frontend_dir):
        dirs[:] = [d for d in dirs if d not in _SKIP_DIRS and not d.startswith(".")]
        for fn in files:
            candidate = os.path.join(root, fn)
            if candidate.endswith(target_file) or fn == os.path.basename(target_file):
                return candidate
    return None


async def accept_last_edit(session_id: str) -> dict:
    """Mark the most recent applied edit as accepted. The file path is
    added to the session's accepted_files set so /edit-lab/publish can
    include it in the GitHub commit. Clears the pending revert snapshot
    so the next edit starts fresh."""
    if not session_id:
        return {"error": "Missing session_id. Please reload the preview.", "session_expired": True}

    registry = get_registry()
    registry.sweep()
    sess = registry.get(session_id)
    if not sess:
        return {"error": "Edit Lab session expired. Reloading preview…", "session_expired": True}

    pending = sess.pending_revert
    if not pending:
        return {"session_id": sess.id, "accepted_files": list(sess.accepted_files)}

    target_file = pending.get("target_file")
    if target_file:
        sess.accepted_files.add(target_file)

    sess.pending_revert = None
    sess.touch()
    return {
        "session_id": sess.id,
        "accepted_files": sorted(sess.accepted_files),
    }


async def publish_session_edits(
    session_id: str,
    access_token: str,
    github_user_id: str = "",
) -> dict:
    """Read every accepted file from the warm workspace and push them to a
    new branch on the user's GitHub repo via the existing publisher."""
    if not session_id:
        return {"error": "Missing session_id. Please reload the preview.", "session_expired": True}
    if not access_token:
        return {"error": "GitHub access token is required to publish."}

    registry = get_registry()
    registry.sweep()
    sess = registry.get(session_id)
    if not sess:
        return {"error": "Edit Lab session expired. Reloading preview…", "session_expired": True}

    if not sess.accepted_files:
        return {"session_id": sess.id, "error": "No accepted edits to publish yet."}

    # Parse owner/repo from the session's github_url
    match = re.search(r"github\.com/([^/]+)/([^/.]+)(?:\.git)?/?$", sess.github_url)
    if not match:
        return {"session_id": sess.id, "error": f"Could not parse owner/repo from {sess.github_url}"}
    owner, repo = match.group(1), match.group(2)

    approved_files: list[dict] = []
    files_missing: list[str] = []
    for rel in sorted(sess.accepted_files):
        full = os.path.join(sess.frontend_dir, rel)
        if not os.path.isfile(full):
            files_missing.append(rel)
            continue
        try:
            with open(full, "r", encoding="utf-8") as f:
                content = f.read()
        except Exception as e:
            logger.warning("Edit Lab publish: could not read %s: %s", rel, e)
            files_missing.append(rel)
            continue

        # Figure out the path to use in the remote repo. The workspace's
        # frontend_dir may be nested under the repo root (e.g. frontend/,
        # apps/web/, packages/site/). Re-derive the repo-relative path by
        # stripping the workspace tmp_dir prefix.
        try:
            repo_rel = os.path.relpath(full, sess.tmp_dir).replace(os.sep, "/")
        except Exception:
            repo_rel = rel
        approved_files.append({"path": repo_rel, "content": content})

    if not approved_files:
        return {
            "session_id": sess.id,
            "error": f"None of the accepted files could be read from the workspace (missing: {', '.join(files_missing)}).",
        }

    from app.services.github_publisher import publish_approved_branch
    try:
        result = await publish_approved_branch(
            owner=owner,
            repo=repo,
            access_token=access_token,
            approved_files=approved_files,
            pages_transformed=[f["path"] for f in approved_files],
            summary_text="The Lab: section edits",
            base_branch=sess.branch,
        )
    except Exception as e:
        logger.error("Edit Lab publish failed: %s", e, exc_info=True)
        return {"session_id": sess.id, "error": f"Publish failed: {e}"}

    sess.touch()
    return {
        "session_id": sess.id,
        "branch_name": result.get("branch_name", ""),
        "branch_url": result.get("branch_url", ""),
        "files_changed": result.get("files_changed", []),
    }


async def revert_last_edit(session_id: str) -> dict:
    """Restore the most recent pre-edit file snapshot and re-render the
    warm dev server. Clears the pending revert on success so subsequent
    reverts know there's nothing more to undo."""
    if not session_id:
        return {"error": "Missing session_id. Please reload the preview.", "session_expired": True}

    registry = get_registry()
    registry.sweep()
    sess = registry.get(session_id)
    if not sess:
        return {"error": "Edit Lab session expired. Reloading preview…", "session_expired": True}

    pending = sess.pending_revert
    if not pending:
        return {"session_id": sess.id, "error": "Nothing to revert — no edit has been applied yet."}

    target_full = pending.get("target_full_path") or os.path.join(sess.frontend_dir, pending.get("target_file", ""))
    if not target_full or not os.path.isfile(target_full):
        sess.pending_revert = None
        return {"session_id": sess.id, "error": "Could not locate the file to revert (it may have been moved or renamed)."}

    try:
        with open(target_full, "w", encoding="utf-8") as f:
            f.write(pending["original_code"])

        # Wait for HMR to recompile the reverted file before screenshotting.
        await asyncio.sleep(2.5)

        screenshot_b64, detection = await _playwright_collect(sess.base_url)
        sections = detection.get("sections", []) or []
        document_size = detection.get("document_size", {"width": 1440, "height": 900})

        _assign_source_files(sections, sess.frontend_dir, pending.get("target_file"))

        sess.pending_revert = None
        sess.touch()

        return {
            "session_id": sess.id,
            "screenshot": screenshot_b64,
            "sections": sections,
            "document_size": document_size,
            "target_file": pending.get("target_file"),
        }
    except Exception as e:
        logger.error("Edit Lab revert failed: %s", e, exc_info=True)
        return {"session_id": sess.id, "error": f"Revert failed: {e}"}


async def apply_section_edit(
    session_id: str,
    target_file: str,
    section_label: str,
    section_heading: str,
    section_paragraph: str,
    section_text: str,
    user_prompt: str,
    section_tag: str = "",
    section_classes: str = "",
    section_role: str = "",
    section_aria_label: str = "",
) -> dict:
    """Patch the target file in the live session workspace, trigger HMR, re-screenshot."""
    if not session_id:
        return {"error": "Missing session_id. Please reload the preview.", "session_expired": True}
    if not target_file:
        return {"error": "Missing target_file."}

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return {"error": "ANTHROPIC_API_KEY is not configured."}

    registry = get_registry()
    registry.sweep()
    sess = registry.get(session_id)
    if not sess:
        return {"error": "Edit Lab session expired. Reloading preview…", "session_expired": True}

    try:
        target_full = _locate_target_file(sess, target_file)
        if not target_full:
            return {"error": f"Could not locate {target_file} in the workspace."}

        # Extract literal anchors from the user's prompt and, if a different
        # source file in the workspace contains them more strongly than the
        # currently-selected target, retarget the edit. This is the fix for
        # "change the word acme to hamza" on a custom drag region: the
        # frontend passes the root page file, but the actual "Acme" text
        # lives in components/Sidebar.tsx — so we retarget there.
        prompt_anchors = _extract_prompt_anchors(user_prompt)
        if prompt_anchors:
            better = _find_best_file_for_anchors(
                sess.frontend_dir, prompt_anchors, target_file,
            )
            if better:
                logger.info(
                    "Edit Lab apply: retargeting %s → %s based on prompt anchors %s",
                    target_file, better, prompt_anchors,
                )
                target_file = better
                located = _locate_target_file(sess, target_file)
                if located:
                    target_full = located

        with open(target_full, "r", encoding="utf-8") as f:
            current_code = f.read()

        # Snapshot the pre-edit content so the user can reject the edit
        # afterwards. Overwrites any previous pending revert — V1 supports
        # one level of undo.
        sess.pending_revert = {
            "target_file": target_file,
            "target_full_path": target_full,
            "original_code": current_code,
        }

        prompt = _build_scoped_prompt(
            current_code,
            section_label=section_label,
            section_heading=section_heading,
            section_paragraph=section_paragraph,
            section_text=section_text,
            section_tag=section_tag,
            section_classes=section_classes,
            section_role=section_role,
            section_aria_label=section_aria_label,
            user_prompt=user_prompt,
            prompt_anchors=prompt_anchors,
        )

        client = anthropic.Anthropic(api_key=api_key)
        message = await asyncio.to_thread(
            client.messages.create,
            model="claude-sonnet-4-6",
            max_tokens=16384,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = message.content[0].text.strip()
        revised_code = _extract_code_response(raw)

        if revised_code.strip() == current_code.strip():
            logger.warning("Edit Lab apply: identical code, retrying with stronger instruction")
            retry = await asyncio.to_thread(
                client.messages.create,
                model="claude-sonnet-4-6",
                max_tokens=16384,
                messages=[
                    {"role": "user", "content": prompt},
                    {
                        "role": "user",
                        "content": (
                            "Your previous response was IDENTICAL to the original file. You did NOT "
                            f"apply the change. The user asked to modify the '{section_label}' section: "
                            f'"{user_prompt}". Apply the change now. Return the complete updated file.'
                        ),
                    },
                ],
            )
            revised_code = _extract_code_response(retry.content[0].text.strip())

        if revised_code.strip() == current_code.strip():
            return {
                "session_id": sess.id,
                "error": "Claude could not apply the requested change to this section. Try rephrasing.",
            }

        # Sanity check: if the revised code is effectively identical in
        # length (<1% change), Claude probably made a cosmetic tweak that
        # won't be visible. Surface it as an error so the user retries
        # instead of squinting at an unchanged preview.
        len_delta = abs(len(revised_code) - len(current_code)) / max(len(current_code), 1)
        if len_delta < 0.005:
            logger.warning(
                "Edit Lab apply: revised code is only %.2f%% different (likely no-op)",
                len_delta * 100,
            )
            return {
                "session_id": sess.id,
                "error": (
                    "Claude's edit was too subtle to make a visible difference. "
                    "Try rephrasing with a more concrete change (e.g. 'make this "
                    "button text-xl with bg-emerald-500')."
                ),
            }

        with open(target_full, "w", encoding="utf-8") as f:
            f.write(revised_code)

        try:
            summary_msg = await asyncio.to_thread(
                client.messages.create,
                model="claude-haiku-4-5-20251001",
                max_tokens=80,
                messages=[{
                    "role": "user",
                    "content": (
                        f"Write a 3-6 word commit title (no punctuation, no code terms) describing this UI "
                        f"change to the '{section_label}' section: {user_prompt}"
                    ),
                }],
            )
            summary = summary_msg.content[0].text.strip()
        except Exception:
            summary = f"Updated {section_label}"

        # Wait for Fast Refresh / HMR to recompile
        await asyncio.sleep(2.5)

        # Screenshot against the *still-running* dev server — no restart
        screenshot_b64, detection = await _playwright_collect(sess.base_url)
        sections = detection.get("sections", []) or []
        document_size = detection.get("document_size", {"width": 1440, "height": 900})

        _assign_source_files(sections, sess.frontend_dir, target_file)
        updated_section_id = _match_updated_section(
            section_label, section_heading, section_paragraph, sections,
        )

        sess.touch()
        return {
            "session_id": sess.id,
            "screenshot": screenshot_b64,
            "sections": sections,
            "document_size": document_size,
            "updated_code": revised_code,
            "summary": summary,
            "target_file": target_file,
            "updated_section_id": updated_section_id,
        }
    except Exception as e:
        if is_anthropic_exception(e):
            info = log_and_classify(e)
            return {
                "session_id": sess.id,
                "error": info.user_message,
                "error_kind": info.kind,
            }
        logger.error("Edit Lab apply failed: %s", e, exc_info=True)
        return {"session_id": sess.id, "error": f"Apply failed: {e}"}
