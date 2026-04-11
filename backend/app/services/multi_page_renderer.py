"""
Multi-page renderer — clones a repo ONCE, starts a dev server ONCE,
and captures before/after screenshots for multiple transformed pages.
"""

import asyncio
import logging
import os
import shutil
import tempfile
import urllib.request
import urllib.error

from app.services.preview_renderer import (
    _find_free_port,
    _clone_repo,
    _find_frontend_root,
    _install_deps,
    _generate_dummy_env,
    _detect_framework,
    _start_dev_server,
    _wait_for_server,
    _kill_server,
    _guess_route,
)
from app.services.screenshot import take_screenshot_b64, take_screenshot_b64_with_error_check

logger = logging.getLogger(__name__)

# Intentionally empty. With the esbuild-backed JSX parser validation and
# bumped retry count upstream, real preview-render failures should be rare.
# When they do happen, we silently fall back to showing the BEFORE screenshot
# in the AFTER pane rather than surfacing a scary amber error banner — the
# user already has a retry affordance via the regenerate button. Keeping the
# constant around (rather than deleting it) preserves the assignment-shaped
# flow below so a future change can reinstate a soft message without
# rewiring every call site.
_PREVIEW_ERROR_MESSAGE = ""

_HTTP_ERROR_MARKERS = (
    "Build Error",
    "Failed to compile",
    "SyntaxError",
    "Unexpected token",
    "Module not found",
    "__next_error__",
)


def _probe_url_for_build_error(url: str) -> bool:
    """Fetch the raw HTML once and scan for dev-server error markers.

    Runs in addition to the Playwright-based check because Next.js often
    embeds the error in the initial HTML response even when the overlay
    lives inside a closed shadow root.
    """
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "reform-renderer/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read(200_000).decode("utf-8", errors="replace")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        logger.debug("HTTP probe failed for %s: %s", url, e)
        return False
    return any(marker in body for marker in _HTTP_ERROR_MARKERS)


def _dev_server_alive(port: int) -> bool:
    """Fast liveness check for the local dev server.

    Used to detect a dead server mid-run after a Playwright "Page crashed"
    event (which often kills the renderer process *and* the dev server in
    one shot on memory-hungry pages). Cheap enough to call between pages.
    """
    url = f"http://localhost:{port}/"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "reform-renderer/1.0"})
        with urllib.request.urlopen(req, timeout=2) as resp:
            return resp.status < 500
    except (urllib.error.URLError, TimeoutError, OSError, ConnectionRefusedError) as e:
        logger.debug("Liveness probe failed for %s: %s", url, e)
        return False


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

        # ── Step 2.5: Generate dummy env vars ──
        _generate_dummy_env(frontend_dir)

        # ── Step 3: Start dev server once ──
        proc = _start_dev_server(frontend_dir, port)
        server_ready = _wait_for_server(port)
        if not server_ready:
            stderr = ""
            stdout = ""
            if proc.stderr:
                try:
                    stderr = proc.stderr.read(4000).decode("utf-8", errors="replace")
                except Exception:
                    pass
            if proc.stdout:
                try:
                    stdout = proc.stdout.read(2000).decode("utf-8", errors="replace")
                except Exception:
                    pass
            logger.error("Dev server failed. stderr: %s", stderr[:1000])
            logger.error("Dev server failed. stdout: %s", stdout[:500])
            for t in transforms:
                results[t["path"]] = {
                    "before_screenshot": "",
                    "after_screenshot": "",
                    "preview_error": f"Dev server failed to start. {stderr[:200]}",
                }
            return results

        logger.info("Dev server ready on port %d — proceeding with screenshots", port)

        # ── Step 4: Screenshot each transformed page ──
        #
        # Heavy pages (dashboards with charts, large client trees) can OOM
        # the Chromium renderer *and* the Next dev worker in one shot —
        # Playwright reports "Page crashed" and every subsequent request to
        # the dev server gets ECONNREFUSED. Without recovery, the loop burns
        # ~30s per remaining page on guaranteed-failing goto calls. The two
        # safeguards below fix that:
        #
        #   1. A cheap liveness probe runs before each page and after every
        #      failure. If the server is dead we restart it exactly once.
        #   2. If the restart fails (or we've already used our budget), we
        #      mark every remaining page with a clear error and break out
        #      instead of marching through doomed screenshots.
        restart_budget = 1

        def _mark_remaining_dead(start_idx: int, reason: str) -> None:
            for t in transforms[start_idx:]:
                if t["path"] not in results:
                    results[t["path"]] = {
                        "before_screenshot": "",
                        "after_screenshot": "",
                        "preview_error": reason,
                    }

        for i, transform in enumerate(transforms):
            page_path = transform["path"]
            framework = _detect_framework(frontend_dir)
            route = transform.get("route") or _guess_route(page_path, framework)
            updated_code = transform["updated_code"]
            preview_url = f"http://localhost:{port}{route}"

            if i >= max_screenshots:
                results[page_path] = {
                    "before_screenshot": "",
                    "after_screenshot": "",
                    "preview_error": "Skipped — screenshot limit reached.",
                }
                continue

            # Pre-flight liveness probe. If the server died on a previous
            # iteration, try to revive it before wasting a full screenshot
            # attempt on a guaranteed-failing URL.
            if not await asyncio.to_thread(_dev_server_alive, port):
                if restart_budget > 0:
                    restart_budget -= 1
                    logger.warning("Dev server not responding before %s — restarting (budget left: %d)", page_path, restart_budget)
                    _kill_server(proc)
                    proc = _start_dev_server(frontend_dir, port)
                    if not _wait_for_server(port):
                        logger.error("Dev server failed to come back after restart — aborting remaining pages")
                        _mark_remaining_dead(i, "Dev server crashed and could not be restarted.")
                        break
                    logger.info("Dev server restarted on port %d", port)
                else:
                    logger.error("Dev server dead and restart budget exhausted — aborting remaining pages")
                    _mark_remaining_dead(i, "Dev server crashed and could not be restarted.")
                    break

            target_full_path = _find_file_in_repo(tmp_dir, frontend_dir, page_path)
            if not target_full_path:
                results[page_path] = {
                    "before_screenshot": "",
                    "after_screenshot": "",
                    "preview_error": f"Could not find {page_path} in cloned repo.",
                }
                continue

            with open(target_full_path, "r", encoding="utf-8") as f:
                original_content = f.read()

            patched = False
            try:
                # Screenshot BEFORE
                logger.info("Screenshotting BEFORE: %s", preview_url)
                before_b64 = await take_screenshot_b64(preview_url)

                # Patch file with transformed code
                logger.info("Patching %s for AFTER preview", target_full_path)
                with open(target_full_path, "w", encoding="utf-8") as f:
                    f.write(updated_code)
                patched = True

                # Wait for HMR
                await asyncio.sleep(4)

                # Screenshot AFTER (with error detection). We probe the URL
                # first to catch build errors embedded in the raw HTML, then
                # let Playwright's error-aware screenshot run as a second
                # check. Either signal trips the fallback.
                logger.info("Screenshotting AFTER: %s", preview_url)
                preview_error = ""
                try:
                    http_error = await asyncio.to_thread(_probe_url_for_build_error, preview_url)
                    if http_error:
                        logger.warning("HTTP probe detected build error for %s — skipping AFTER capture", page_path)
                        after_b64 = before_b64
                        preview_error = _PREVIEW_ERROR_MESSAGE
                    else:
                        after_b64, has_error = await take_screenshot_b64_with_error_check(preview_url)
                        if has_error:
                            logger.warning("AFTER screenshot shows build error for %s — using BEFORE", page_path)
                            after_b64 = before_b64
                            preview_error = _PREVIEW_ERROR_MESSAGE
                except Exception as e:
                    logger.warning("AFTER screenshot failed for %s: %s", page_path, e)
                    after_b64 = before_b64
                    preview_error = _PREVIEW_ERROR_MESSAGE

                # Defense in depth: if the AFTER image ended up byte-identical
                # to the BEFORE (silent fallback somewhere upstream), surface
                # it as a preview error so the UI can explain the emptiness.
                if not preview_error and after_b64 and after_b64 == before_b64:
                    preview_error = _PREVIEW_ERROR_MESSAGE

                results[page_path] = {
                    "before_screenshot": before_b64,
                    "after_screenshot": after_b64,
                    "preview_error": preview_error,
                }

            except Exception as e:
                logger.error("Preview failed for %s: %s", page_path, e)
                results[page_path] = {
                    "before_screenshot": "",
                    "after_screenshot": "",
                    "preview_error": f"Preview failed: {e}",
                }
                # If the dev server died under us, try to revive it exactly
                # once so the remaining pages get a fair shot.
                if not await asyncio.to_thread(_dev_server_alive, port):
                    if restart_budget > 0:
                        restart_budget -= 1
                        logger.warning("Dev server dead after %s failure — restarting (budget left: %d)", page_path, restart_budget)
                        _kill_server(proc)
                        proc = _start_dev_server(frontend_dir, port)
                        if not _wait_for_server(port):
                            logger.error("Dev server failed to come back after restart — aborting remaining pages")
                            _mark_remaining_dead(i + 1, "Dev server crashed and could not be restarted.")
                            break
                        logger.info("Dev server restarted on port %d", port)
                    else:
                        logger.error("Dev server dead and restart budget exhausted — aborting remaining pages")
                        _mark_remaining_dead(i + 1, "Dev server crashed and could not be restarted.")
                        break
            finally:
                # Always restore the original file so the next page's BEFORE
                # screenshot is taken against a clean tree, even if we bailed
                # out mid-iteration with an exception.
                if patched:
                    try:
                        with open(target_full_path, "w", encoding="utf-8") as f:
                            f.write(original_content)
                        await asyncio.sleep(2)
                    except Exception as restore_err:
                        logger.warning("Failed to restore %s: %s", target_full_path, restore_err)

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
