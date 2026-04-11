'use client'

import { useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { apiUrl } from '@/lib/api'

const HEARTBEAT_INTERVAL = 30_000

export default function SiteTracker() {
  const sessionStartRef = useRef(Date.now())
  const hasSentRef = useRef(false)
  const sessionIdRef = useRef(crypto.randomUUID())
  const { data: session } = useSession()

  // Heartbeat — keeps "active users" count live
  useEffect(() => {
    const sendHeartbeat = () => {
      const payload = {
        session_id: sessionIdRef.current,
        github_user_id: (session as any)?.githubId ?? null,
        path: window.location.pathname,
      }
      fetch(apiUrl('/analytics/heartbeat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => {})
    }

    sendHeartbeat()
    const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL)
    return () => clearInterval(interval)
  }, [session])

  // Visit duration — fires once on tab close/hide
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
