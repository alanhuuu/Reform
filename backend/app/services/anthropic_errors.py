"""Classify Anthropic SDK exceptions into user-friendly diagnostic info.

Every Claude API call site in Reform should route its exception handling
through `classify_anthropic_error` (or the `log_and_classify` shortcut)
so the frontend surfaces a specific, actionable message instead of a
generic 500.

The most important signal this helper detects is **credit exhaustion**.
Anthropic returns that as an HTTP 400 BadRequestError whose body contains
a specific substring like "credit balance is too low" — easy to miss
unless you pattern-match on the message, and easy to confuse with a
genuinely malformed prompt.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Literal substrings Anthropic returns in the response body when the
# workspace is out of credits. Pattern-match because the HTTP status is 400,
# not the 402 you'd naively expect.
_CREDIT_EXHAUSTED_SIGNALS = (
    "credit balance is too low",
    "credit balance too low",
    "insufficient credit",
    "insufficient_quota",
    "billing issue",
    "payment required",
)

# Phrases Anthropic uses for plan/tier access problems that aren't strictly
# rate limits but do block usage until the workspace upgrades.
_TIER_UPGRADE_SIGNALS = (
    "upgrade your plan",
    "plan does not support",
    "not available on your plan",
)


@dataclass
class AnthropicErrorInfo:
    kind: str              # credit_exhausted | rate_limit | auth | overloaded | connection | tier | other
    user_message: str      # safe to show to end users, explains *what to do*
    http_status: int       # best proxying HTTP status
    log_message: str       # richer detail for server logs


def _extract_error_body(exc: Exception) -> str:
    """Best-effort pull of the human-readable message out of an Anthropic SDK
    exception. Different SDK versions/error classes stash it in different
    places, so we check several."""
    parts: list[str] = [str(exc) or ""]
    try:
        body_attr = getattr(exc, "body", None)
        if isinstance(body_attr, dict):
            err = body_attr.get("error")
            if isinstance(err, dict):
                msg = err.get("message")
                if msg:
                    parts.append(str(msg))
            msg = body_attr.get("message")
            if msg:
                parts.append(str(msg))
    except Exception:
        pass
    try:
        response = getattr(exc, "response", None)
        if response is not None:
            text = getattr(response, "text", None)
            if callable(text):
                parts.append(text())
            elif isinstance(text, str):
                parts.append(text)
    except Exception:
        pass
    return " | ".join(p for p in parts if p)


def classify_anthropic_error(exc: Exception) -> AnthropicErrorInfo:
    """Turn an Anthropic SDK exception into structured diagnostic info."""
    try:
        import anthropic  # type: ignore
    except Exception:
        anthropic = None  # type: ignore

    body_text = _extract_error_body(exc)
    body_lower = body_text.lower()

    # Credit exhaustion wins first — its HTTP status is 400, which would
    # otherwise fall into the generic bucket and confuse users.
    if any(sig in body_lower for sig in _CREDIT_EXHAUSTED_SIGNALS):
        return AnthropicErrorInfo(
            kind="credit_exhausted",
            user_message=(
                "Claude API credits have run out on Reform's Anthropic "
                "workspace. Add credits in the Anthropic billing console "
                "and retry — no code change is needed."
            ),
            http_status=402,
            log_message=f"[Claude] credit balance exhausted: {body_text}",
        )

    if any(sig in body_lower for sig in _TIER_UPGRADE_SIGNALS):
        return AnthropicErrorInfo(
            kind="tier",
            user_message=(
                "Claude API workspace plan does not have access to this "
                "model. Upgrade the Anthropic plan tier or switch to an "
                "allowed model, then retry."
            ),
            http_status=403,
            log_message=f"[Claude] plan/tier error: {body_text}",
        )

    if anthropic is not None:
        if isinstance(exc, getattr(anthropic, "RateLimitError", ())):
            return AnthropicErrorInfo(
                kind="rate_limit",
                user_message=(
                    "Claude API is rate-limiting this workspace. Wait about "
                    "a minute and retry, or upgrade the Anthropic plan tier."
                ),
                http_status=429,
                log_message=f"[Claude] rate limit hit: {body_text}",
            )
        if isinstance(exc, getattr(anthropic, "AuthenticationError", ())):
            return AnthropicErrorInfo(
                kind="auth",
                user_message=(
                    "Claude API key is invalid or missing on the backend. "
                    "Check ANTHROPIC_API_KEY in the deploy environment."
                ),
                http_status=401,
                log_message=f"[Claude] auth failed: {body_text}",
            )
        if isinstance(exc, getattr(anthropic, "PermissionDeniedError", ())):
            return AnthropicErrorInfo(
                kind="auth",
                user_message=(
                    "Claude API key does not have permission for this "
                    "model. Check the Anthropic workspace model access."
                ),
                http_status=403,
                log_message=f"[Claude] permission denied: {body_text}",
            )
        if isinstance(exc, getattr(anthropic, "InternalServerError", ())):
            return AnthropicErrorInfo(
                kind="overloaded",
                user_message=(
                    "Claude API is temporarily overloaded on Anthropic's "
                    "side. Retry in a few seconds."
                ),
                http_status=503,
                log_message=f"[Claude] server error: {body_text}",
            )
        if isinstance(exc, getattr(anthropic, "APIConnectionError", ())):
            return AnthropicErrorInfo(
                kind="connection",
                user_message=(
                    "Could not reach the Claude API from the backend. This "
                    "is usually a transient network hiccup — retry in a "
                    "moment."
                ),
                http_status=503,
                log_message=f"[Claude] connection error: {body_text}",
            )
        if isinstance(exc, getattr(anthropic, "APITimeoutError", ())):
            return AnthropicErrorInfo(
                kind="connection",
                user_message=(
                    "Claude API timed out. The model took too long to "
                    "respond — retry, and if it keeps happening shrink the "
                    "prompt or try a faster model."
                ),
                http_status=504,
                log_message=f"[Claude] timeout: {body_text}",
            )

    return AnthropicErrorInfo(
        kind="other",
        user_message=f"Claude API call failed: {body_text[:240] or 'unknown error'}",
        http_status=500,
        log_message=f"[Claude] unclassified error: {body_text}",
    )


def is_anthropic_exception(exc: Exception) -> bool:
    """Return True if this looks like it originated from the Anthropic SDK."""
    try:
        import anthropic  # type: ignore
    except Exception:
        return False
    base = getattr(anthropic, "APIError", None)
    if base is not None and isinstance(exc, base):
        return True
    # Fall back to duck typing — some SDK versions don't expose APIError the
    # same way but still put the error text in the message.
    body_lower = _extract_error_body(exc).lower()
    return "anthropic" in body_lower or "claude" in body_lower


def log_and_classify(exc: Exception) -> AnthropicErrorInfo:
    """Classify an exception and log it at the appropriate severity."""
    info = classify_anthropic_error(exc)
    if info.kind in ("credit_exhausted", "auth", "tier"):
        logger.error(info.log_message)
    elif info.kind == "rate_limit":
        logger.warning(info.log_message)
    else:
        logger.error(info.log_message, exc_info=True)
    return info
