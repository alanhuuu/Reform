"""
Subscription service — plan config, feature gating, and usage tracking.

All plan enforcement happens here. Routes call these functions to check
whether a user can perform an action before proceeding.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import UserSubscription

# ── Plan definitions ────────────────────────────────────────────────────

PLAN_LIMITS = {
    "free": {
        "max_repos": 1,
        "max_scans_per_month": 3,
        "pr_autofix": False,
        "full_report": False,
    },
    "pro": {
        "max_repos": 5,
        "max_scans_per_month": 50,
        "pr_autofix": True,
        "full_report": True,
    },
    "max": {
        "max_repos": -1,  # unlimited
        "max_scans_per_month": 500,
        "pr_autofix": True,
        "full_report": True,
    },
}


# ── Price → plan mapping ────────────────────────────────────────────────

# Maps Stripe price IDs to internal plan names.
# Reads from env so the mapping stays in sync with the frontend.
PRICE_TO_PLAN: dict[str, str] = {}


def _load_price_map() -> dict[str, str]:
    """Build the price→plan map from env vars (lazy, cached)."""
    if PRICE_TO_PLAN:
        return PRICE_TO_PLAN
    pro_id = os.environ.get("STRIPE_PRO_PRICE_ID", "")
    max_id = os.environ.get("STRIPE_MAX_PRICE_ID", "")
    if pro_id:
        PRICE_TO_PLAN[pro_id] = "pro"
    if max_id:
        PRICE_TO_PLAN[max_id] = "max"
    return PRICE_TO_PLAN


def plan_from_price_id(price_id: str) -> str:
    """Return 'pro', 'max', or 'free' for a given Stripe price ID."""
    return _load_price_map().get(price_id, "free")


# ── Helpers ─────────────────────────────────────────────────────────────

async def get_or_create_subscription(
    db: AsyncSession, github_user_id: str
) -> UserSubscription:
    """Return the subscription row for a user, creating a free one if absent."""
    result = await db.execute(
        select(UserSubscription).where(
            UserSubscription.github_user_id == github_user_id
        )
    )
    sub = result.scalar_one_or_none()
    if sub is None:
        sub = UserSubscription(github_user_id=github_user_id, plan="free")
        db.add(sub)
        await db.flush()
    return sub


async def get_subscription_by_customer(
    db: AsyncSession, stripe_customer_id: str
) -> Optional[UserSubscription]:
    """Look up a subscription by Stripe customer ID."""
    result = await db.execute(
        select(UserSubscription).where(
            UserSubscription.stripe_customer_id == stripe_customer_id
        )
    )
    return result.scalar_one_or_none()


def _limits(sub: UserSubscription) -> dict:
    return PLAN_LIMITS.get(sub.plan, PLAN_LIMITS["free"])


def _is_active(sub: UserSubscription) -> bool:
    return sub.subscription_status in ("active", "trialing")


# ── Structured error helper ────────────────────────────────────────────

FEATURE_LABELS = {
    "pr_autofix": "PR auto-fix",
    "full_report": "full UX reports",
}


def _gate_error(
    status_code: int,
    error: str,
    message: str,
    *,
    current_plan: str | None = None,
    limit: int | None = None,
    used: int | None = None,
) -> HTTPException:
    """Build a structured HTTPException with a consistent detail shape."""
    detail: dict = {"error": error, "message": message}
    if current_plan is not None:
        detail["current_plan"] = current_plan
    if limit is not None:
        detail["limit"] = limit
    if used is not None:
        detail["used"] = used
    return HTTPException(status_code=status_code, detail=detail)


# ── Feature gating ──────────────────────────────────────────────────────

def check_subscription_active(sub: UserSubscription) -> None:
    """Raise if the subscription is not in an active state."""
    if sub.plan != "free" and not _is_active(sub):
        raise _gate_error(
            403,
            "SUBSCRIPTION_INACTIVE",
            "Your subscription is not active. Please update your payment method.",
            current_plan=sub.plan,
        )


def check_feature(sub: UserSubscription, feature: str) -> None:
    """Raise if the user's plan does not include *feature*.

    Supported features: "pr_autofix", "full_report".
    """
    limits = _limits(sub)
    if not limits.get(feature, False):
        label = FEATURE_LABELS.get(feature, feature)
        raise _gate_error(
            403,
            "FEATURE_NOT_AVAILABLE",
            f"Your {sub.plan} plan does not include {label}. Upgrade to unlock it.",
            current_plan=sub.plan,
        )


def check_repo_limit(sub: UserSubscription) -> None:
    """Raise if the user has reached their repo limit."""
    limits = _limits(sub)
    max_repos = limits["max_repos"]
    if max_repos != -1 and sub.repos_connected >= max_repos:
        raise _gate_error(
            403,
            "PLAN_LIMIT_REACHED",
            f"You've reached the {max_repos}-repo limit on your {sub.plan} plan.",
            current_plan=sub.plan,
            limit=max_repos,
            used=sub.repos_connected,
        )


def check_scan_limit(sub: UserSubscription) -> None:
    """Raise if the user has used all their scans this billing period."""
    limits = _limits(sub)
    max_scans = limits["max_scans_per_month"]
    if sub.scans_used_this_month >= max_scans:
        raise _gate_error(
            403,
            "PLAN_LIMIT_REACHED",
            f"You've used all {max_scans} scans this month.",
            current_plan=sub.plan,
            limit=max_scans,
            used=sub.scans_used_this_month,
        )


# ── Usage tracking ──────────────────────────────────────────────────────

async def increment_scan_usage(db: AsyncSession, sub: UserSubscription) -> int:
    """Increment the scan counter and return the new total.

    Automatically resets the counter if the billing period has rolled over.
    """
    _maybe_reset_usage(sub)
    check_subscription_active(sub)
    check_scan_limit(sub)

    sub.scans_used_this_month += 1
    await db.flush()
    return sub.scans_used_this_month


async def increment_repo_count(db: AsyncSession, sub: UserSubscription) -> int:
    """Increment repos_connected and return the new total."""
    check_subscription_active(sub)
    check_repo_limit(sub)

    sub.repos_connected += 1
    await db.flush()
    return sub.repos_connected


def _maybe_reset_usage(sub: UserSubscription) -> None:
    """Reset scans_used_this_month if the current billing period has ended."""
    if sub.current_period_end and datetime.now(timezone.utc) > sub.current_period_end:
        sub.scans_used_this_month = 0


# ── Query helpers (for routes / UI) ────────────────────────────────────

def subscription_summary(sub: UserSubscription) -> dict:
    """Return a frontend-friendly summary of the user's subscription."""
    limits = _limits(sub)
    return {
        "plan": sub.plan,
        "status": sub.subscription_status,
        "scans_used": sub.scans_used_this_month,
        "scans_limit": limits["max_scans_per_month"],
        "repos_connected": sub.repos_connected,
        "repos_limit": limits["max_repos"],
        "features": {
            "pr_autofix": limits["pr_autofix"],
            "full_report": limits["full_report"],
        },
        "current_period_end": (
            sub.current_period_end.isoformat() if sub.current_period_end else None
        ),
    }
