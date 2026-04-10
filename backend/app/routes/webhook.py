"""
Stripe webhook endpoint.

Handles checkout completion, subscription updates, and cancellations.
Verifies the webhook signature before processing any event.
"""

import logging
import os
from datetime import datetime, timezone

import stripe
from fastapi import APIRouter, Request, HTTPException
from sqlalchemy import select

from app.db import async_session
from app.models import UserSubscription
from app.services.subscription import (
    get_or_create_subscription,
    get_subscription_by_customer,
    plan_from_price_id,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["webhook"])

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")
WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Receive and process Stripe webhook events."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    if not WEBHOOK_SECRET:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # ── Verify signature ────────────────────────────────────────────────
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, WEBHOOK_SECRET)
    except ValueError:
        logger.warning("Webhook: invalid payload")
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.SignatureVerificationError:
        logger.warning("Webhook: invalid signature")
        raise HTTPException(status_code=400, detail="Invalid signature")

    event_type = event["type"]
    # Stripe SDK v8+ returns typed objects, not dicts. Convert to dict
    # so all handlers can use .get() safely.
    raw = event["data"]["object"]
    data = raw.to_dict() if hasattr(raw, "to_dict") else dict(raw)

    logger.info("Webhook received: %s", event_type)

    # ── Route events ────────────────────────────────────────────────────
    if not async_session:
        raise HTTPException(status_code=500, detail="Database not configured")

    async with async_session() as db:
        try:
            if event_type == "checkout.session.completed":
                await _handle_checkout_completed(db, data)
            elif event_type == "customer.subscription.updated":
                await _handle_subscription_updated(db, data)
            elif event_type == "customer.subscription.deleted":
                await _handle_subscription_deleted(db, data)
            else:
                logger.info("Webhook: unhandled event type %s", event_type)

            await db.commit()
        except Exception:
            await db.rollback()
            logger.exception("Webhook handler failed for %s", event_type)
            raise HTTPException(status_code=500, detail="Webhook processing failed")

    return {"status": "ok"}


# ── Event handlers ──────────────────────────────────────────────────────

async def _handle_checkout_completed(db, session_data: dict) -> None:
    """Handle checkout.session.completed — activate the subscription."""
    if session_data.get("mode") != "subscription":
        return

    github_user_id = (session_data.get("metadata") or {}).get("github_user_id")
    customer_id = session_data.get("customer")
    subscription_id = session_data.get("subscription")

    if not github_user_id:
        logger.warning("Webhook checkout: missing github_user_id in metadata")
        return

    sub = await get_or_create_subscription(db, github_user_id)

    # Fetch the full subscription from Stripe to get price + period info
    stripe_sub_raw = stripe.Subscription.retrieve(subscription_id)
    stripe_sub = stripe_sub_raw.to_dict() if hasattr(stripe_sub_raw, "to_dict") else dict(stripe_sub_raw)
    item = stripe_sub["items"]["data"][0]
    price_id = item["price"]["id"]

    sub.stripe_customer_id = customer_id
    sub.stripe_subscription_id = subscription_id
    sub.plan = plan_from_price_id(price_id)
    sub.subscription_status = stripe_sub["status"]

    # Period dates live on the subscription item in newer Stripe API versions
    period_start = item.get("current_period_start")
    period_end = item.get("current_period_end")
    if period_start:
        sub.current_period_start = datetime.fromtimestamp(period_start, tz=timezone.utc)
    if period_end:
        sub.current_period_end = datetime.fromtimestamp(period_end, tz=timezone.utc)
    sub.scans_used_this_month = 0  # reset on new subscription

    logger.info(
        "Checkout completed: user=%s plan=%s status=%s",
        github_user_id, sub.plan, sub.subscription_status,
    )


async def _handle_subscription_updated(db, sub_data: dict) -> None:
    """Handle customer.subscription.updated — plan change, renewal, or status change."""
    customer_id = sub_data.get("customer")
    sub = await get_subscription_by_customer(db, customer_id)

    if not sub:
        logger.warning("Webhook sub.updated: no user for customer %s", customer_id)
        return

    item = sub_data["items"]["data"][0]
    price_id = item["price"]["id"]

    sub.plan = plan_from_price_id(price_id)
    sub.subscription_status = sub_data["status"]
    sub.stripe_subscription_id = sub_data["id"]

    period_start = item.get("current_period_start")
    period_end = item.get("current_period_end")

    # Reset usage on period renewal (new period_start means billing cycle rolled)
    if sub_data.get("status") == "active" and period_start and sub.current_period_start:
        new_start = datetime.fromtimestamp(period_start, tz=timezone.utc)
        if new_start > sub.current_period_start:
            sub.scans_used_this_month = 0

    if period_start:
        sub.current_period_start = datetime.fromtimestamp(period_start, tz=timezone.utc)
    if period_end:
        sub.current_period_end = datetime.fromtimestamp(period_end, tz=timezone.utc)

    logger.info(
        "Subscription updated: user=%s plan=%s status=%s",
        sub.github_user_id, sub.plan, sub.subscription_status,
    )


async def _handle_subscription_deleted(db, sub_data: dict) -> None:
    """Handle customer.subscription.deleted — downgrade to free."""
    customer_id = sub_data.get("customer")
    sub = await get_subscription_by_customer(db, customer_id)

    if not sub:
        logger.warning("Webhook sub.deleted: no user for customer %s", customer_id)
        return

    sub.plan = "free"
    sub.subscription_status = "canceled"
    sub.stripe_subscription_id = None
    sub.current_period_start = None
    sub.current_period_end = None

    logger.info("Subscription deleted: user=%s downgraded to free", sub.github_user_id)
