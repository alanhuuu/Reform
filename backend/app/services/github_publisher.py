"""
GitHub branch publisher — creates a new branch and commits approved
transformed files via the GitHub REST API.
"""

import base64
import logging
import re
from datetime import datetime, timezone

import httpx

logger = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com"
USER_AGENT = "RefineUI-Bot/1.0"


def _github_headers(token: str) -> dict:
    return {
        "Accept": "application/vnd.github.v3+json",
        "Authorization": f"Bearer {token}",
        "User-Agent": USER_AGENT,
    }


# ─── Branch Naming ──────────────────────────────────────────────────────────


def generate_branch_name(
    pages_transformed: list[str],
    summary_text: str | None = None,
) -> str:
    """Generate a human-readable branch name from transform metadata.

    Format: reform/<short-summary>-<YYYYMMDD>-<HHMM>
    """
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")

    slug = _build_slug(pages_transformed, summary_text)

    return f"reform/{slug}-{timestamp}"


def _build_slug(pages: list[str], summary: str | None) -> str:
    """Build the descriptive part of the branch name."""
    # Try pages first
    if pages:
        if len(pages) == 1:
            slug = f"improve-{_slugify(pages[0])}"
        elif len(pages) <= 3:
            names = "-".join(_slugify(p) for p in pages)
            slug = f"improve-{names}"
        else:
            slug = f"multi-page-ui-upgrade-{len(pages)}-pages"

        # Keep it reasonable length (max ~50 chars for the slug part)
        if len(slug) <= 50:
            return slug

    # Fall back to summary text
    if summary:
        slug = _slugify(summary)[:50]
        if slug:
            return slug

    return "ui-update"


def _slugify(text: str) -> str:
    """Convert text to a lowercase dash-separated slug."""
    # Extract just the filename if it's a path
    if "/" in text:
        text = text.rsplit("/", 1)[-1]
    # Remove file extensions
    text = re.sub(r"\.\w+$", "", text)
    # Replace non-alphanumeric with dashes, collapse, strip
    text = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return text or "page"


# ─── GitHub API Operations ──────────────────────────────────────────────────


async def _get_default_branch(
    client: httpx.AsyncClient, headers: dict, owner: str, repo: str,
) -> str:
    """Fetch the repository's default branch name."""
    res = await client.get(f"{GITHUB_API}/repos/{owner}/{repo}", headers=headers)
    if res.status_code == 401:
        raise PermissionError("GitHub token is invalid or expired")
    if res.status_code == 403:
        raise PermissionError(f"Access denied to {owner}/{repo}")
    if res.status_code == 404:
        raise ValueError(f"Repository {owner}/{repo} not found")
    if res.status_code != 200:
        raise RuntimeError(f"Failed to fetch repo metadata: {res.status_code}")
    return res.json()["default_branch"]


async def list_repo_branches(
    owner: str, repo: str, access_token: str,
) -> dict:
    """List all branches in a repo. Returns {default_branch, branches}.

    Paginates up to 5 pages (500 branches) — enough for any realistic
    project, and the GitHub API caps per_page at 100.
    """
    headers = _github_headers(access_token)
    branches: list[dict] = []
    async with httpx.AsyncClient(timeout=30.0) as client:
        default_branch = await _get_default_branch(client, headers, owner, repo)
        for page in range(1, 6):
            res = await client.get(
                f"{GITHUB_API}/repos/{owner}/{repo}/branches",
                headers=headers,
                params={"per_page": 100, "page": page},
            )
            if res.status_code == 401:
                raise PermissionError("GitHub token is invalid or expired")
            if res.status_code == 403:
                raise PermissionError(f"Access denied to {owner}/{repo}")
            if res.status_code != 200:
                raise RuntimeError(f"Failed to list branches: {res.status_code}")
            batch = res.json()
            if not batch:
                break
            for b in batch:
                branches.append({
                    "name": b.get("name", ""),
                    "protected": bool(b.get("protected", False)),
                })
            if len(batch) < 100:
                break
    return {"default_branch": default_branch, "branches": branches}


async def _get_branch_sha(
    client: httpx.AsyncClient, headers: dict, owner: str, repo: str, branch: str,
) -> str:
    """Get the latest commit SHA of a branch."""
    res = await client.get(
        f"{GITHUB_API}/repos/{owner}/{repo}/git/ref/heads/{branch}",
        headers=headers,
    )
    if res.status_code != 200:
        raise ValueError(f"Could not find branch '{branch}': {res.status_code}")
    return res.json()["object"]["sha"]


async def _create_branch(
    client: httpx.AsyncClient, headers: dict,
    owner: str, repo: str, branch_name: str, sha: str,
) -> None:
    """Create a new branch ref from a given SHA."""
    res = await client.post(
        f"{GITHUB_API}/repos/{owner}/{repo}/git/refs",
        headers=headers,
        json={"ref": f"refs/heads/{branch_name}", "sha": sha},
    )
    if res.status_code not in (200, 201):
        detail = res.text[:300]
        raise RuntimeError(f"Failed to create branch '{branch_name}': {detail}")


async def _commit_file(
    client: httpx.AsyncClient, headers: dict,
    owner: str, repo: str, branch: str, path: str, content: str,
    commit_message: str,
) -> None:
    """Create or update a single file on a branch via the contents API."""
    file_url = f"{GITHUB_API}/repos/{owner}/{repo}/contents/{path}?ref={branch}"
    file_res = await client.get(file_url, headers=headers)
    file_sha = file_res.json().get("sha") if file_res.status_code == 200 else None

    encoded = base64.b64encode(content.encode("utf-8")).decode("utf-8")
    body: dict = {
        "message": commit_message,
        "content": encoded,
        "branch": branch,
    }
    if file_sha:
        body["sha"] = file_sha

    put_res = await client.put(
        f"{GITHUB_API}/repos/{owner}/{repo}/contents/{path}",
        headers=headers,
        json=body,
    )
    if put_res.status_code not in (200, 201):
        detail = put_res.text[:300]
        raise RuntimeError(f"Failed to commit '{path}': {detail}")


async def _trigger_deploy_webhook(
    client: httpx.AsyncClient, headers: dict,
    owner: str, repo: str,
) -> None:
    """Fire a repository_dispatch event to trigger Vercel/Netlify auto-deploy.

    GitHub Contents API commits don't trigger push webhooks, so hosting
    platforms won't auto-deploy. This dispatch event fills that gap.
    """
    try:
        res = await client.post(
            f"{GITHUB_API}/repos/{owner}/{repo}/dispatches",
            headers=headers,
            json={"event_type": "reform-deploy", "client_payload": {"source": "reform"}},
        )
        if res.status_code in (200, 204):
            logger.info("Triggered deploy webhook for %s/%s", owner, repo)
        else:
            logger.warning("Deploy webhook returned %d for %s/%s (non-fatal)", res.status_code, owner, repo)
    except Exception as e:
        # Non-fatal — the commit succeeded, deploy trigger is best-effort
        logger.warning("Failed to trigger deploy webhook: %s (non-fatal)", e)


# ─── Orchestrator ───────────────────────────────────────────────────────────


async def publish_approved_branch(
    owner: str,
    repo: str,
    access_token: str,
    approved_files: list[dict],
    pages_transformed: list[str],
    summary_text: str | None = None,
    base_branch: str | None = None,
    create_new_branch: bool = True,
) -> dict:
    """Commit approved files to GitHub.

    Two modes:
      • create_new_branch=True  → branch off `base_branch` with a generated
        name, then commit there. The safe default.
      • create_new_branch=False → commit directly to `base_branch`. Used
        when the user explicitly picks an existing target branch.

    Returns dict with: branch_name, branch_url, files_changed.
    """
    if not approved_files:
        raise ValueError("No approved files to publish")

    headers = _github_headers(access_token)

    async with httpx.AsyncClient(timeout=60.0) as client:
        # 1. Resolve base branch
        if not base_branch:
            base_branch = await _get_default_branch(client, headers, owner, repo)
            logger.info("Resolved default branch: %s", base_branch)

        if create_new_branch:
            # Branch off base_branch with a generated name.
            base_sha = await _get_branch_sha(client, headers, owner, repo, base_branch)
            logger.info("Base branch '%s' SHA: %s", base_branch, base_sha[:12])

            target_branch = generate_branch_name(pages_transformed, summary_text)
            await _create_branch(client, headers, owner, repo, target_branch, base_sha)
            logger.info("Created branch: %s (from %s)", target_branch, base_branch)
        else:
            # Commit directly to the existing branch. We still verify the
            # branch exists up-front so we fail fast with a clear error
            # rather than on the first commit attempt.
            await _get_branch_sha(client, headers, owner, repo, base_branch)
            target_branch = base_branch
            logger.info("Committing directly to existing branch: %s", target_branch)

        # 2. Commit each file
        files_changed = []
        for i, f in enumerate(approved_files):
            path = f["path"]
            content = f["content"]
            msg = f"reform: update {path}" if i > 0 else _build_commit_message(pages_transformed)
            await _commit_file(client, headers, owner, repo, target_branch, path, content, msg)
            files_changed.append(path)
            logger.info("Committed file %d/%d: %s", i + 1, len(approved_files), path)

        # 3. Trigger repository_dispatch so Vercel/Netlify auto-deploy
        await _trigger_deploy_webhook(client, headers, owner, repo)

    branch_url = f"https://github.com/{owner}/{repo}/tree/{target_branch}"

    return {
        "branch_name": target_branch,
        "branch_url": branch_url,
        "files_changed": files_changed,
    }


def _build_commit_message(pages: list[str]) -> str:
    """Build the first commit message summarizing the transform."""
    if not pages:
        return "reform: UI improvements"
    if len(pages) == 1:
        return f"reform: improve UI for {pages[0]}"
    return f"reform: improve UI for {len(pages)} pages"
