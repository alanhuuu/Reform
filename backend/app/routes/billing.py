"""
Billing routes — Stripe Checkout, subscription status, and portal.
"""

import os

import stripe
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.services.subscription import get_or_create_subscription, subscription_summary

router = APIRouter(prefix="/billing", tags=["billing"])

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")


# ── Request / response schemas ──────────────────────────────────────────

class CheckoutRequest(BaseModel):
    price_id: str
    github_user_id: str


class CheckoutResponse(BaseModel):
    checkout_url: str


class PortalRequest(BaseModel):
    github_user_id: str


# ── Routes ───────────────────────────────────────────────────────────────

@router.post("/create-checkout-session", response_model=CheckoutResponse)
async def create_checkout_session(
    body: CheckoutRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a Stripe Checkout session and return the hosted page URL."""
    if not stripe.api_key:
        raise HTTPException(status_code=500, detail={
            "error": "CHECKOUT_FAILED",
            "message": "Payment system is not configured. Please try again later.",
        })

    sub = await get_or_create_subscription(db, body.github_user_id)

    # Reuse or create a Stripe customer
    if sub.stripe_customer_id:
        customer_id = sub.stripe_customer_id
    else:
        customer = stripe.Customer.create(
            metadata={"github_user_id": body.github_user_id},
        )
        sub.stripe_customer_id = customer.id
        customer_id = customer.id
        await db.flush()

    session = stripe.checkout.Session.create(
        customer=customer_id,
        mode="subscription",
        line_items=[{"price": body.price_id, "quantity": 1}],
        success_url=f"{FRONTEND_URL}/dashboard?checkout=success",
        cancel_url=f"{FRONTEND_URL}/dashboard?checkout=canceled",
        metadata={"github_user_id": body.github_user_id},
    )

    return CheckoutResponse(checkout_url=session.url)


@router.post("/create-portal-session")
async def create_portal_session(
    body: PortalRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a Stripe Customer Portal session so users can manage their sub."""
    sub = await get_or_create_subscription(db, body.github_user_id)

    if not sub.stripe_customer_id:
        raise HTTPException(status_code=400, detail={
            "error": "SUBSCRIPTION_INACTIVE",
            "message": "No active subscription found. Subscribe to a plan first.",
        })

    session = stripe.billing_portal.Session.create(
        customer=sub.stripe_customer_id,
        return_url=f"{FRONTEND_URL}/dashboard",
    )
    return {"portal_url": session.url}


@router.get("/subscription/{github_user_id}")
async def get_subscription(
    github_user_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Return the user's current plan, usage, and limits."""
    sub = await get_or_create_subscription(db, github_user_id)
    return subscription_summary(sub)
