/**
 * Billing feature flag.
 *
 * Set NEXT_PUBLIC_BILLING_ENABLED=true in Vercel to re-enable billing UI.
 * When false (or unset), all pricing pages, upgrade prompts, and plan
 * limits are hidden so the product can be demoed without paywalls.
 */
export const BILLING_ENABLED = process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true'
