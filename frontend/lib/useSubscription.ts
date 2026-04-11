import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { apiUrl } from '@/lib/api'
import { BILLING_ENABLED } from '@/lib/billing'

export interface SubscriptionData {
  plan: string
  status: string
  scans_used: number
  scans_limit: number
  repos_connected: number
  repos_limit: number // -1 = unlimited
  features: {
    pr_autofix: boolean
    full_report: boolean
  }
  current_period_end: string | null
}

const DEFAULT_FREE: SubscriptionData = {
  plan: 'free',
  status: 'active',
  scans_used: 0,
  scans_limit: 3,
  repos_connected: 0,
  repos_limit: 1,
  features: { pr_autofix: false, full_report: false },
  current_period_end: null,
}

export function useSubscription() {
  const { data: session } = useSession()
  const [subscription, setSubscription] = useState<SubscriptionData>(DEFAULT_FREE)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session?.githubId) {
      setLoading(false)
      return
    }

    fetch(apiUrl(`/billing/subscription/${session.githubId}`))
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setSubscription(data)
      })
      .catch((err) => {
        console.warn('Failed to fetch subscription status:', err.message || err)
      })
      .finally(() => setLoading(false))
  }, [session?.githubId])

  // When billing is disabled, unlock all features so the product can be demoed freely.
  const canScan = !BILLING_ENABLED || subscription.scans_used < subscription.scans_limit
  const canAddRepo = !BILLING_ENABLED || subscription.repos_limit === -1 || subscription.repos_connected < subscription.repos_limit
  const canAutofix = !BILLING_ENABLED || subscription.features.pr_autofix
  const isFree = BILLING_ENABLED && subscription.plan === 'free'

  return {
    subscription,
    loading,
    canScan,
    canAddRepo,
    canAutofix,
    isFree,
    refresh: () => {
      if (!session?.githubId) return
      fetch(apiUrl(`/billing/subscription/${session.githubId}`))
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setSubscription(data) })
        .catch((err) => { console.warn('Failed to refresh subscription:', err.message || err) })
    },
  }
}
