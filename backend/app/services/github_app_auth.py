"""
GitHub App authentication helper.

Mints installation access tokens so the rest of the backend can talk to the
GitHub API on behalf of a user *without* requiring an OAuth `repo` scope.
This is the per-repo-scoped alternative to the all-or-nothing OAuth flow.

Flow recap:
  1. User installs the Reform GitHub App on selected repos via github.com.
  2. GitHub redirects to our callback with `installation_id`.
  3. We persist (github_user_id → installation_id, account_login) in
     `github_app_installations`.
  4. Whenever the backend needs to read/write a repo, it calls
     `resolve_github_token(repo_full_name, github_user_id, fallback_token)`.
     The resolver finds the installation that owns the repo and mints a
     short-lived installation token for it. If no installation matches,
     it falls back to the user's OAuth token (legacy path), so existing
     users keep working during the migration.

Env vars:
  GITHUB_APP_ID            — numeric App ID from the GitHub App settings page
  GITHUB_APP_SLUG          — URL slug, e.g. "reform-by-hamza"
  GITHUB_APP_PRIVATE_KEY   — PEM-encoded private key (multiline string)

When the env vars are missing, every helper degrades gracefully so the rest
of the app keeps running on OAuth tokens.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Optional

import httpx
import jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import GithubAppInstallation

logger = logging.getLogger(__name__)

# In-memory cache for installation tokens. GitHub installation tokens have
# a 1-hour TTL; we re-mint at 50 minutes to leave headroom.
_TOKEN_TTL_SECONDS = 60 * 50
_token_cache: dict[str, tuple[str, float]] = {}  # installation_id → (token, expires_at)


def _app_id() -> str:
    return os.environ.get("GITHUB_APP_ID", "")


def app_slug() -> str:
    return os.environ.get("GITHUB_APP_SLUG", "")


def _private_key() -> str:
    raw = os.environ.get("GITHUB_APP_PRIVATE_KEY", "")
    # Railway / .env files often store multi-line PEMs as `\n`-escaped strings.
    # Normalize so PyJWT's RS256 signer accepts the key.
    return raw.replace("\\n", "\n")


def is_configured() -> bool:
    """True when all GitHub App env vars are set. Routes use this to decide
    whether the App flow is available at all (otherwise we 503 the install
    endpoints with a clear error)."""
    return bool(_app_id() and app_slug() and _private_key())


def _generate_app_jwt() -> str:
    """Sign a short-lived JWT proving we are the GitHub App.

    Used to authenticate the App-level endpoints (e.g. exchanging for an
    installation token). 10-minute TTL is GitHub's max.
    """
    now = int(time.time())
    payload = {
        # Issued 30s in the past to absorb clock skew between this server
        # and GitHub — GitHub rejects future-dated `iat` claims outright.
        "iat": now - 30,
        "exp": now + (9 * 60),
        "iss": _app_id(),
    }
    return jwt.encode(payload, _private_key(), algorithm="RS256")


async def get_installation_token(installation_id: str) -> str:
    """Return a fresh installation access token, using the in-memory cache
    when possible. Raises RuntimeError if the App isn't configured or the
    GitHub API call fails."""
    if not is_configured():
        raise RuntimeError("GitHub App is not configured (missing env vars)")
    if not installation_id:
        raise ValueError("installation_id is required")

    cached = _token_cache.get(installation_id)
    if cached and cached[1] > time.time():
        return cached[0]

    app_jwt = _generate_app_jwt()
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            f"https://api.github.com/app/installations/{installation_id}/access_tokens",
            headers={
                "Authorization": f"Bearer {app_jwt}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
    if response.status_code != 201:
        logger.error(
            "GitHub App token mint failed for installation %s: %d %s",
            installation_id, response.status_code, response.text[:200],
        )
        raise RuntimeError(
            f"Failed to mint installation token (HTTP {response.status_code})"
        )

    token = response.json().get("token", "")
    if not token:
        raise RuntimeError("GitHub returned an empty installation token")

    _token_cache[installation_id] = (token, time.time() + _TOKEN_TTL_SECONDS)
    return token


async def find_installation_for_repo(
    db: AsyncSession,
    repo_full_name: str,
    github_user_id: Optional[str],
) -> Optional[GithubAppInstallation]:
    """Find the installation that owns a given `owner/repo`.

    Strategy: match on the repo owner (the `owner/` prefix) against
    `account_login`. We prefer installations belonging to the requesting
    user, but fall through to any matching installation — installations on
    organizations are shared across all members, and the requesting user may
    or may not have a row of their own for that org.
    """
    if not repo_full_name or "/" not in repo_full_name:
        return None
    owner = repo_full_name.split("/", 1)[0]

    # First pass: this user's own installations on the matching account
    if github_user_id:
        result = await db.execute(
            select(GithubAppInstallation)
            .where(
                GithubAppInstallation.github_user_id == github_user_id,
                GithubAppInstallation.account_login == owner,
            )
            .order_by(GithubAppInstallation.updated_at.desc())
            .limit(1)
        )
        row = result.scalar_one_or_none()
        if row:
            return row

    # Second pass: any installation on the matching account (shared org case)
    result = await db.execute(
        select(GithubAppInstallation)
        .where(GithubAppInstallation.account_login == owner)
        .order_by(GithubAppInstallation.updated_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def resolve_github_token(
    db: Optional[AsyncSession],
    repo_full_name: str,
    github_user_id: Optional[str],
    fallback_oauth_token: Optional[str],
) -> str:
    """Return the best GitHub token to use for a given repo.

    Resolution order:
      1. A GitHub App installation token, if the user has installed the App
         on the repo's owner. This is the per-repo-scoped path that solves
         the "I don't want to grant access to all my repos" complaint.
      2. The user's OAuth `access_token` from NextAuth, kept as a fallback
         so existing users on the legacy `repo` scope keep working without
         a forced re-onboarding.

    Returns "" only if both are absent — the caller should treat that as
    "user has no GitHub access" and surface a clear install-the-App CTA.
    """
    if db is not None and is_configured():
        try:
            installation = await find_installation_for_repo(
                db, repo_full_name, github_user_id,
            )
            if installation:
                return await get_installation_token(installation.installation_id)
        except Exception as e:
            # Log and fall through to the OAuth path — we never want a
            # transient GitHub API hiccup to take down the whole pipeline
            # when there's a perfectly good fallback token in hand.
            logger.warning(
                "GitHub App token resolution failed for %s (user=%s): %s — "
                "falling back to OAuth token",
                repo_full_name, github_user_id, e,
            )

    return fallback_oauth_token or ""


async def list_installation_repos(installation_id: str) -> list[dict]:
    """Page through `GET /installation/repositories` and return the full list.

    Returns dicts with the same shape the frontend already consumes from
    `https://api.github.com/user/repos` so the repo picker stays drop-in
    compatible (`full_name`, `name`, `private`, `default_branch`, etc.).
    """
    token = await get_installation_token(installation_id)
    repos: list[dict] = []
    page = 1
    async with httpx.AsyncClient(timeout=15) as client:
        while True:
            response = await client.get(
                "https://api.github.com/installation/repositories",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
                params={"per_page": 100, "page": page},
            )
            if response.status_code != 200:
                logger.error(
                    "list_installation_repos failed for %s: %d %s",
                    installation_id, response.status_code, response.text[:200],
                )
                break
            data = response.json()
            batch = data.get("repositories", []) or []
            repos.extend(batch)
            if len(batch) < 100:
                break
            page += 1
    return repos
