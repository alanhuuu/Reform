"""
Multi-page renderer — clones a repo ONCE, starts a dev server ONCE,
and captures before/after screenshots for multiple transformed pages.
"""

import asyncio
import logging
import os
import shutil
import tempfile

from app.services.preview_renderer import (
    _find_free_port,
    _clone_repo,
    _find_frontend_root,
    _install_deps,
    _start_dev_server,
    _wait_for_server,
    _kill_server,
    _guess_route,
)
from app.services.screenshot import take_screenshot_b64

logger = logging.getLogger(__name__)


async def render_multi_page_previews(
    repo_clone_url: str,
    branch: str,
    transforms: list[dict],
    access_token: str = "",
    max_screenshots: int = 2,
) -> dict[str, dict]:
    """
    Clone once, install once, start server once, screenshot multiple pages.

    Args:
        repo_clone_url: GitHub clone URL.
        branch: Git branch.
        transforms: List of dicts with keys: path, route, updated_code.
        access_token: GitHub access token for private repos.
        max_screenshots: Max pages to screenshot (expensive operation).

    Returns:
        Dict mapping page path → {before_screenshot, after_screenshot, preview_error}.
    """
    results: dict[str, dict] = {}

    if not repo_clone_url or not transforms:
        for t in transforms:
            results[t["path"]] = {
                "before_screenshot": "",
                "after_screenshot": "",
                "preview_error": "No repository URL provided." if not repo_clone_url else "",
            }
        return results

    tmp_dir = tempfile.mkdtemp(prefix="reform_multi_preview_")
    proc = None
    port = _find_free_port()

    try:
        # ── Step 1: Clone repo once ──
        _clone_repo(repo_clone_url, branch, tmp_dir, access_token)

        # ── Step 2: Find frontend root & install deps once ──
        frontend_dir = _find_frontend_root(tmp_dir)
        _install_deps(frontend_dir)

        # ── Step 3: Start dev server once ──
        proc = _start_dev_server(frontend_dir, port)
        if not _wait_for_server(port):
            stderr = ""
            if proc.stderr:
                try:
                    stderr = proc.stderr.read(2000).decode("utf-8", errors="replace")
                except Exception:
                    pass
            for t in transforms:
                results[t["path"]] = {
                    "before_screenshot": "",
                    "after_screenshot": "",
                    "preview_error": f"Dev server failed to start. {stderr[:200]}",
                }
            return results

        # ── Step 4: Screenshot each transformed page ──
        for i, transform in enumerate(transforms):
            page_path = transform["path"]
            route = transform.get("route") or _guess_route(page_path)
            updated_code = transform["updated_code"]
            preview_url = f"http://localhost:{port}{route}"

            if i >= max_screenshots:
                results[page_path] = {
                    "before_screenshot": "",
                    "after_screenshot": "",
                    "preview_error": "Skipped — screenshot limit reached.",
                }
                continue

            try:
                # Find the actual file in the cloned repo
                target_full_path = _find_file_in_repo(tmp_dir, frontend_dir, page_path)

                if not target_full_path:
                    results[page_path] = {
                        "before_screenshot": "",
                        "after_screenshot": "",
                        "preview_error": f"Could not find {page_path} in cloned repo.",
                    }
                    continue

                # Read original content for backup
                with open(target_full_path, "r", encoding="utf-8") as f:
                    original_content = f.read()

                # Screenshot BEFORE
                logger.info("Screenshotting BEFORE: %s", preview_url)
                before_b64 = await take_screenshot_b64(preview_url)

                # Patch file with transformed code
                logger.info("Patching %s for AFTER preview", target_full_path)
                with open(target_full_path, "w", encoding="utf-8") as f:
                    f.write(updated_code)

                # Wait for HMR
                await asyncio.sleep(4)

                # Screenshot AFTER
                logger.info("Screenshotting AFTER: %s", preview_url)
                try:
                    after_b64 = await take_screenshot_b64(preview_url)
                except Exception as e:
                    logger.warning("AFTER screenshot failed for %s: %s", page_path, e)
                    after_b64 = before_b64

                # Restore original file (so next page's BEFORE is clean)
                with open(target_full_path, "w", encoding="utf-8") as f:
                    f.write(original_content)

                # Wait for HMR to restore
                await asyncio.sleep(2)

                results[page_path] = {
                    "before_screenshot": before_b64,
                    "after_screenshot": after_b64,
                    "preview_error": "",
                }

            except Exception as e:
                logger.error("Preview failed for %s: %s", page_path, e)
                results[page_path] = {
                    "before_screenshot": "",
                    "after_screenshot": "",
                    "preview_error": f"Preview failed: {e}",
                }

    except Exception as e:
        logger.error("Multi-page preview pipeline failed: %s", e, exc_info=True)
        for t in transforms:
            if t["path"] not in results:
                results[t["path"]] = {
                    "before_screenshot": "",
                    "after_screenshot": "",
                    "preview_error": f"Pipeline failed: {e}",
                }

    finally:
        if proc:
            _kill_server(proc)
        try:
            shutil.rmtree(tmp_dir, ignore_errors=True)
        except Exception:
            pass

    return results


def _find_file_in_repo(
    repo_dir: str,
    frontend_dir: str,
    target_path: str,
) -> str | None:
    """Locate a file within the cloned repo directory."""
    # Try direct path
    full_path = os.path.join(repo_dir, target_path)
    if os.path.isfile(full_path):
        return full_path

    # Try under frontend_dir
    full_path = os.path.join(frontend_dir, target_path)
    if os.path.isfile(full_path):
        return full_path

    # Search for it
    for root, _dirs, filenames in os.walk(repo_dir):
        for fn in filenames:
            candidate = os.path.join(root, fn)
            if candidate.endswith(target_path):
                return candidate

    return None
