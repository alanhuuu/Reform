'use client'

import { useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { apiUrl } from '@/lib/api'

export default function SiteTracker() {
  const sessionStartRef = useRef(Date.now())
  const hasSentRef = useRef(false)
  const { data: session } = useSession()

  useEffect(() => {
    const sendVisit = () => {
      if (hasSentRef.current) return
      hasSentRef.current = true

      const duration = Math.round((Date.now() - sessionStartRef.current) / 1000)
      if (duration < 1) return

      const payload = {
        duration_seconds: Math.min(duration, 86400),
        github_user_id: (session as any)?.githubId ?? null,
        path: window.location.pathname,
      }

      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
      navigator.sendBeacon(apiUrl('/analytics/track-visit'), blob)
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') sendVisit()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('beforeunload', sendVisit)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('beforeunload', sendVisit)
    }
  }, [session])

  return null
}
