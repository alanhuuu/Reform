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
from typing import Any, Optional

import anthropic

from app.services.edit_lab_workspace import (
    EditLabSession,
    create_session,
    get_registry,
)
from app.services.page_discovery import discover_pages

logger = logging.getLogger(__name__)


SECTION_DETECTION_SCRIPT = r"""
() => {
  const selector = 'header, nav, main > *, section, footer, aside, [data-section]';
  const nodes = Array.from(document.querySelectorAll(selector));
  const sections = [];
  nodes.forEach((el, idx) => {
    const rect = el.getBoundingClientRect();
    const abs = {
      x: Math.round(rect.x + window.scrollX),
      y: Math.round(rect.y + window.scrollY),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
    if (abs.width < 120 || abs.height < 60) return;

    const tag = el.tagName.toLowerCase();
    const classAttr = (el.className && el.className.toString ? el.className.toString() : '').toLowerCase();
    const dataSec = el.getAttribute('data-section') || '';
    const ariaLabel = el.getAttribute('aria-label') || '';

    let label = dataSec || ariaLabel;
    if (!label) {
      if (tag === 'nav' || classAttr.includes('navbar') || classAttr.includes('menubar')) label = 'Navigation';
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

    sections.push({
      id: 'section-' + idx,
      tag,
      label: (label || 'Section').slice(0, 48),
      rect: abs,
      heading,
      paragraph,
      text: fullText,
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


def _score_file_for_section(
    rel_path: str,
    content: str,
    heading: str,
    paragraph: str,
    section_label: str,
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
    fallback: Optional[str],
) -> Optional[str]:
    """Rank candidate source files and return the highest-scoring one."""
    if not any([heading, paragraph, section_label]):
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
            score = _score_file_for_section(rel, content, heading, paragraph, section_label)
            if score <= 0:
                continue
            # Higher score wins; on tie, prefer shorter path (more likely top-level component)
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
            fallback=fallback,
        )


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
    user_prompt: str,
) -> str:
    identifier_lines = [f'- Label: "{section_label}"']
    if section_heading:
        identifier_lines.append(f'- Heading: "{section_heading}"')
    if section_paragraph:
        identifier_lines.append(f'- Paragraph snippet: "{section_paragraph}"')
    if section_text and not (section_heading or section_paragraph):
        identifier_lines.append(f'- Visible text: "{section_text[:160]}"')
    identifier = "\n".join(identifier_lines)

    return f"""You are a senior frontend engineer editing a single React/JSX file.

## File to modify
{current_code}

## The user has selected ONE section of the rendered page
Identify the JSX that renders the section described below (match by visible text content):
{identifier}

## User's requested change for that section
"{user_prompt}"

---

## CRITICAL RULES
1. Modify ONLY the JSX that renders the identified section. Leave every other section of this file untouched.
2. The change MUST be visibly different when the page re-renders. Do not return an unchanged file.
3. If the section's JSX is rendered via a child component imported from another file, apply the user's change by restructuring the usage in THIS file (replace the component with inline JSX that achieves the change) rather than editing any other file.
4. Preserve all imports, exports, hooks, state, event handlers, and unrelated markup.
5. Return the COMPLETE updated file — not a diff, not a snippet.
6. Return ONLY code — no explanation, no markdown fences, no commentary.
7. Start with the first line of the original file (import, 'use client', or similar)."""


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


async def apply_section_edit(
    session_id: str,
    target_file: str,
    section_label: str,
    section_heading: str,
    section_paragraph: str,
    section_text: str,
    user_prompt: str,
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

        with open(target_full, "r", encoding="utf-8") as f:
            current_code = f.read()

        prompt = _build_scoped_prompt(
            current_code,
            section_label,
            section_heading,
            section_paragraph,
            section_text,
            user_prompt,
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
        logger.error("Edit Lab apply failed: %s", e, exc_info=True)
        return {"session_id": sess.id, "error": f"Apply failed: {e}"}
