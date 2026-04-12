"""
GitHub App routes — install URL, callback handler, and per-user repo listing.

These endpoints power the "install Reform on selected repos" flow that
replaces (and runs alongside) the all-or-nothing OAuth `repo` scope.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import GithubAppInstallation
from app.services.github_app_auth import (
    app_slug,
    get_installation_token,
    is_configured,
    list_installation_repos,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/github-app", tags=["github-app"])


# ─── Schemas ─────────────────────────────────────────────────────────


class InstallUrlResponse(BaseModel):
    install_url: str
    configured: bool


class InstallationCallbackRequest(BaseModel):
    installation_id: str
    github_user_id: str


class InstallationSummary(BaseModel):
    installation_id: str
    account_login: str
    account_type: str


class InstallationsListResponse(BaseModel):
    configured: bool
    installations: list[InstallationSummary]


class GithubRepoSummary(BaseModel):
    """Drop-in subset of the GitHub repo shape the frontend already consumes
    from `GET https://api.github.com/user/repos`."""
    id: int
    name: str
    full_name: str
    private: bool
    language: str | None = None
    updated_at: str | None = None
    default_branch: str = "main"
    homepage: str | None = None
    html_url: str


class ReposListResponse(BaseModel):
    configured: bool
    repos: list[GithubRepoSummary]


# ─── Routes ──────────────────────────────────────────────────────────


@router.get("/install-url", response_model=InstallUrlResponse)
async def get_install_url(github_user_id: str = Query(...)):
    """Return the URL the frontend should open to start the install flow.

    GitHub will redirect the user back to the App's configured callback URL
    after they pick repos; we round-trip `github_user_id` through the `state`
    param so the callback handler knows which Reform user just installed.
    """
    if not is_configured():
        return InstallUrlResponse(install_url="", configured=False)
    slug = app_slug()
    return InstallUrlResponse(
        install_url=(
            f"https://github.com/apps/{slug}/installations/new?state={github_user_id}"
        ),
        configured=True,
    )


@router.post("/installation-callback")
async def installation_callback(
    req: InstallationCallbackRequest,
    db: AsyncSession = Depends(get_db),
):
    """Persist a fresh installation. Idempotent on (user_id, installation_id).

    Called by the frontend `/github-app/callback` page after GitHub redirects
    back from the install screen with `?installation_id=...&state=<user_id>`.
    We confirm the installation against the GitHub API (using a JWT-minted
    token) so a malicious caller can't store a fake installation row.
    """
    if not is_configured():
        raise HTTPException(status_code=503, detail="GitHub App is not configured")
    if not req.installation_id or not req.github_user_id:
        raise HTTPException(status_code=400, detail="installation_id and github_user_id are required")

    # Verify the installation exists and grab its `account` payload (login + type)
    # by minting a real installation token through it. If GitHub rejects the
    # mint we abort — the caller is either lying or the install was revoked.
    try:
        token = await get_installation_token(req.installation_id)
    except Exception as e:
        logger.warning("Rejecting installation %s: %s", req.installation_id, e)
        raise HTTPException(status_code=400, detail=f"Could not verify installation: {e}")

    async with httpx.AsyncClient(timeout=10) as client:
        meta_resp = await client.get(
            f"https://api.github.com/app/installations/{req.installation_id}",
            headers={
                # Installation metadata requires the App JWT, not the
                # installation token — generate it fresh.
                "Authorization": f"Bearer {_app_jwt_for_metadata()}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
        )
    if meta_resp.status_code != 200:
        logger.error(
            "installation metadata fetch failed for %s: %d %s",
            req.installation_id, meta_resp.status_code, meta_resp.text[:200],
        )
        raise HTTPException(status_code=400, detail="Could not fetch installation metadata")
    meta = meta_resp.json()
    account = meta.get("account") or {}
    account_login = account.get("login") or ""
    account_type = account.get("type") or "User"

    # Upsert by (github_user_id, installation_id). A user can be in many orgs
    # so they may have multiple rows; we don't dedupe across users because
    # different users may share an installation row when an org installs once.
    existing = await db.execute(
        select(GithubAppInstallation).where(
            GithubAppInstallation.github_user_id == req.github_user_id,
            GithubAppInstallation.installation_id == req.installation_id,
        )
    )
    row = existing.scalar_one_or_none()
    if row:
        row.account_login = account_login
        row.account_type = account_type
        row.updated_at = datetime.now(timezone.utc)
    else:
        row = GithubAppInstallation(
            github_user_id=req.github_user_id,
            installation_id=req.installation_id,
            account_login=account_login,
            account_type=account_type,
        )
        db.add(row)
    await db.flush()

    # Touch token cache so the next mint reuses the freshly-minted token.
    _ = token  # already cached inside get_installation_token

    return {
        "ok": True,
        "installation_id": req.installation_id,
        "account_login": account_login,
        "account_type": account_type,
    }


@router.get("/installations", response_model=InstallationsListResponse)
async def list_user_installations(
    github_user_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """List all installations a user has linked to their account."""
    result = await db.execute(
        select(GithubAppInstallation)
        .where(GithubAppInstallation.github_user_id == github_user_id)
        .order_by(GithubAppInstallation.updated_at.desc())
    )
    rows = result.scalars().all()
    return InstallationsListResponse(
        configured=is_configured(),
        installations=[
            InstallationSummary(
                installation_id=r.installation_id,
                account_login=r.account_login,
                account_type=r.account_type,
            )
            for r in rows
        ],
    )


@router.get("/repos", response_model=ReposListResponse)
async def list_user_app_repos(
    github_user_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate every repo across all of a user's installations.

    Returns a flat list shaped to match the GitHub `/user/repos` response so
    the frontend repo picker can render it without translation. The list is
    deduplicated on `full_name` (an org installation seen via two members
    would otherwise return the same repos twice).
    """
    if not is_configured():
        return ReposListResponse(configured=False, repos=[])

    result = await db.execute(
        select(GithubAppInstallation).where(
            GithubAppInstallation.github_user_id == github_user_id,
        )
    )
    installations = result.scalars().all()
    if not installations:
        return ReposListResponse(configured=True, repos=[])

    seen: set[str] = set()
    repos: list[GithubRepoSummary] = []
    for inst in installations:
        try:
            raw_repos = await list_installation_repos(inst.installation_id)
        except Exception as e:
            logger.warning(
                "list_installation_repos failed for %s: %s — skipping",
                inst.installation_id, e,
            )
            continue
        for r in raw_repos:
            full_name = r.get("full_name") or ""
            if not full_name or full_name in seen:
                continue
            seen.add(full_name)
            repos.append(GithubRepoSummary(
                id=int(r.get("id") or 0),
                name=r.get("name") or "",
                full_name=full_name,
                private=bool(r.get("private", False)),
                language=r.get("language"),
                updated_at=r.get("updated_at"),
                default_branch=r.get("default_branch") or "main",
                homepage=r.get("homepage"),
                html_url=r.get("html_url") or f"https://github.com/{full_name}",
            ))
    return ReposListResponse(configured=True, repos=repos)


def _app_jwt_for_metadata() -> str:
    """Inline JWT generator so we don't import the private helper from
    github_app_auth (avoids a leaky private symbol)."""
    import time

    import jwt as _jwt  # local import keeps the route module fast to load

    private_key = os.environ.get("GITHUB_APP_PRIVATE_KEY", "").replace("\\n", "\n")
    app_id = os.environ.get("GITHUB_APP_ID", "")
    now = int(time.time())
    return _jwt.encode(
        {"iat": now - 30, "exp": now + 9 * 60, "iss": app_id},
        private_key,
        algorithm="RS256",
    )
