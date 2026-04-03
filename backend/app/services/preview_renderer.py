"""
Real preview renderer — clones a repo, installs deps, starts a dev server,
and captures Playwright screenshots for BEFORE and AFTER states.
"""

import asyncio
import logging
import os
import random
import shutil
import subprocess
import tempfile
import time

from app.services.screenshot import take_screenshot_b64

logger = logging.getLogger(__name__)

# How long to wait for npm install (seconds)
INSTALL_TIMEOUT = 120
# How long to wait for dev server to be ready (seconds)
SERVER_READY_TIMEOUT = 90
# How long to wait between health checks (seconds)
HEALTH_CHECK_INTERVAL = 2


def _find_free_port() -> int:
    """Find a free port in the 4000-9000 range."""
    import socket
    for _ in range(20):
        port = random.randint(4000, 9000)
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("", port))
                return port
            except OSError:
                continue
    raise RuntimeError("Could not find a free port")


def _clone_repo(repo_url: str, branch: str, target_dir: str, access_token: str = "") -> None:
    """Clone a GitHub repo to target_dir."""
    # Insert token into URL for private repos
    if access_token and "github.com" in repo_url:
        repo_url = repo_url.replace("https://github.com/", f"https://x-access-token:{access_token}@github.com/")

    logger.info("Cloning %s (branch: %s) to %s", repo_url, branch, target_dir)
    result = subprocess.run(
        ["git", "clone", "--depth", "1", "--branch", branch, repo_url, target_dir],
        capture_output=True, text=True, timeout=60,
    )
    if result.returncode != 0:
        raise RuntimeError(f"git clone failed: {result.stderr.strip()}")


def _is_frontend_package(pkg_path: str) -> bool:
    """Check if a package.json contains Next.js or React as a dependency."""
    import json as _json
    try:
        with open(pkg_path, "r") as f:
            data = _json.load(f)
        all_deps = {**data.get("dependencies", {}), **data.get("devDependencies", {})}
        return "next" in all_deps or "react" in all_deps
    except Exception:
        return False


def _find_frontend_root(repo_dir: str) -> str:
    """Find the directory containing package.json with a Next.js or React setup.

    Strategy:
    1. Check common hardcoded names first (fast path)
    2. Scan all immediate subdirectories
    3. Prefer dirs with 'next' in deps over plain 'react'
    """
    # Fast path: check common locations first
    priority_dirs = [
        repo_dir,
        os.path.join(repo_dir, "frontend"),
        os.path.join(repo_dir, "client"),
        os.path.join(repo_dir, "web"),
        os.path.join(repo_dir, "app"),
        os.path.join(repo_dir, "src"),
    ]
    for d in priority_dirs:
        pkg = os.path.join(d, "package.json")
        if os.path.isfile(pkg) and _is_frontend_package(pkg):
            logger.info("Frontend root (priority): %s", d)
            return d

    # Scan all immediate subdirectories for any package.json with react/next
    best = None
    for entry in os.listdir(repo_dir):
        subdir = os.path.join(repo_dir, entry)
        if not os.path.isdir(subdir) or entry.startswith(".") or entry == "node_modules":
            continue
        pkg = os.path.join(subdir, "package.json")
        if os.path.isfile(pkg) and _is_frontend_package(pkg):
            logger.info("Frontend root (scan): %s", subdir)
            # Prefer next over plain react
            import json as _json
            try:
                with open(pkg) as f:
                    data = _json.load(f)
                all_deps = {**data.get("dependencies", {}), **data.get("devDependencies", {})}
                if "next" in all_deps:
                    return subdir
                if best is None:
                    best = subdir
            except Exception:
                if best is None:
                    best = subdir

    if best:
        return best

    # Last resort: repo root if it has any package.json
    root_pkg = os.path.join(repo_dir, "package.json")
    if os.path.isfile(root_pkg):
        logger.warning("Frontend root fallback to repo root (no react/next detected)")
        return repo_dir

    raise RuntimeError("Could not find package.json with React or Next.js in repo")


def _install_deps(frontend_dir: str) -> None:
    """Run npm install in the frontend directory."""
    logger.info("Installing dependencies in %s", frontend_dir)
    # Prefer npm ci for speed, fall back to npm install
    lock_file = os.path.join(frontend_dir, "package-lock.json")
    cmd = ["npm", "ci", "--prefer-offline"] if os.path.isfile(lock_file) else ["npm", "install"]
    start = time.time()
    result = subprocess.run(
        cmd, cwd=frontend_dir,
        capture_output=True, text=True, timeout=INSTALL_TIMEOUT,
        env={**os.environ, "NODE_ENV": "development"},
    )
    elapsed = time.time() - start
    if result.returncode != 0:
        logger.error("npm install failed after %.1fs: %s", elapsed, result.stderr[-500:])
        raise RuntimeError(f"npm install failed: {result.stderr.strip()[-200:]}")
    # Sanity check: if install took < 5s, deps probably weren't actually installed
    if elapsed < 5:
        node_modules = os.path.join(frontend_dir, "node_modules")
        if not os.path.isdir(node_modules) or len(os.listdir(node_modules)) < 10:
            logger.warning("npm install finished in %.1fs but node_modules looks empty — deps may not have installed", elapsed)
    logger.info("Dependencies installed in %.1fs", elapsed)


def _start_dev_server(frontend_dir: str, port: int) -> subprocess.Popen:
    """Start the Next.js dev server on a specific port."""
    logger.info("Starting dev server on port %d in %s", port, frontend_dir)
    env = {
        **os.environ,
        "PORT": str(port),
        "NODE_ENV": "development",
        "NEXT_TELEMETRY_DISABLED": "1",
    }
    proc = subprocess.Popen(
        ["npx", "next", "dev", "--port", str(port)],
        cwd=frontend_dir,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        env=env,
    )
    return proc


def _wait_for_server(port: int, timeout: int = SERVER_READY_TIMEOUT) -> bool:
    """Wait for the dev server to respond on the given port."""
    import urllib.request
    import urllib.error

    url = f"http://localhost:{port}"
    start = time.time()
    while time.time() - start < timeout:
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=3) as resp:
                if resp.status < 500:
                    logger.info("Dev server ready on port %d (%.1fs)", port, time.time() - start)
                    return True
        except (urllib.error.URLError, ConnectionRefusedError, OSError):
            pass
        time.sleep(HEALTH_CHECK_INTERVAL)

    logger.error("Dev server on port %d did not become ready in %ds", port, timeout)
    return False


def _kill_server(proc: subprocess.Popen) -> None:
    """Kill the dev server process and its children."""
    if proc.poll() is None:
        try:
            proc.terminate()
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=3)


async def render_previews(
    repo_clone_url: str,
    branch: str,
    target_file: str,
    updated_code: str,
    access_token: str = "",
) -> dict:
    """
    Real preview pipeline:
    1. Clone repo → install deps → start dev server → screenshot BEFORE
    2. Patch target file → wait for HMR → screenshot AFTER
    3. Clean up

    Returns dict with before_screenshot, after_screenshot, preview_route, preview_error.
    """
    import re

    if not repo_clone_url:
        return {
            "before_screenshot": "",
            "after_screenshot": "",
            "preview_route": "/",
            "preview_error": "No repository URL provided for preview rendering.",
        }

    tmp_dir = tempfile.mkdtemp(prefix="reform_preview_")
    proc = None
    port = _find_free_port()
    route = _guess_route(target_file)

    try:
        # ── Step 1: Clone ──
        _clone_repo(repo_clone_url, branch, tmp_dir, access_token)

        # ── Step 2: Find frontend root & install deps ──
        frontend_dir = _find_frontend_root(tmp_dir)
        _install_deps(frontend_dir)

        # ── Step 3: Start dev server ──
        proc = _start_dev_server(frontend_dir, port)
        if not _wait_for_server(port):
            # Read any error output
            stderr = ""
            if proc.stderr:
                try:
                    stderr = proc.stderr.read(2000).decode("utf-8", errors="replace") if proc.stderr.readable() else ""
                except Exception:
                    pass
            return {
                "before_screenshot": "",
                "after_screenshot": "",
                "preview_route": route,
                "preview_error": f"Dev server failed to start. {stderr[:200]}",
            }

        preview_url = f"http://localhost:{port}{route}"
        logger.info("Screenshotting BEFORE: %s", preview_url)

        # ── Step 4: Screenshot BEFORE (the real committed code) ──
        try:
            before_b64 = await take_screenshot_b64(preview_url)
        except Exception as e:
            return {
                "before_screenshot": "",
                "after_screenshot": "",
                "preview_route": route,
                "preview_error": f"BEFORE screenshot failed: {e}",
            }

        # ── Step 5: Patch the target file with transformed code ──
        # Find the actual file path within the cloned repo
        target_full_path = os.path.join(tmp_dir, target_file)
        if not os.path.isfile(target_full_path):
            # Try under frontend_dir
            target_full_path = os.path.join(frontend_dir, target_file)
        if not os.path.isfile(target_full_path):
            # Search for it
            for root, dirs, filenames in os.walk(tmp_dir):
                for fn in filenames:
                    if os.path.join(root, fn).endswith(target_file):
                        target_full_path = os.path.join(root, fn)
                        break

        if not os.path.isfile(target_full_path):
            return {
                "before_screenshot": before_b64,
                "after_screenshot": before_b64,
                "preview_route": route,
                "preview_error": f"Could not find {target_file} in cloned repo for AFTER patch.",
            }

        logger.info("Patching %s for AFTER preview", target_full_path)
        with open(target_full_path, "w", encoding="utf-8") as f:
            f.write(updated_code)

        # ── Step 6: Wait for Next.js HMR to pick up the change ──
        await asyncio.sleep(4)

        # ── Step 7: Screenshot AFTER (the modified code) ──
        logger.info("Screenshotting AFTER: %s", preview_url)
        try:
            after_b64 = await take_screenshot_b64(preview_url)
        except Exception as e:
            logger.warning("AFTER screenshot failed: %s", e)
            after_b64 = before_b64

        return {
            "before_screenshot": before_b64,
            "after_screenshot": after_b64,
            "preview_route": route,
            "preview_error": "",
        }

    except Exception as e:
        logger.error("Preview pipeline failed: %s", e, exc_info=True)
        return {
            "before_screenshot": "",
            "after_screenshot": "",
            "preview_route": route,
            "preview_error": f"Preview pipeline failed: {e}",
        }

    finally:
        # ── Cleanup ──
        if proc:
            _kill_server(proc)
        try:
            shutil.rmtree(tmp_dir, ignore_errors=True)
        except Exception:
            pass


def _guess_route(target_path: str) -> str:
    """Convert file path to Next.js route."""
    import re
    match = re.search(r'app/(.*?)page\.[jt]sx?$', target_path)
    if match:
        inner = match.group(1).rstrip("/")
        if not inner:
            return "/"
        parts = [p for p in inner.split("/") if not p.startswith("(")]
        return "/" + "/".join(parts) if parts else "/"
    match = re.search(r'pages/(.*?)\.[jt]sx?$', target_path)
    if match:
        inner = match.group(1)
        return "/" if inner == "index" else "/" + inner
    return "/"
