import { useEffect, useState } from 'react'
import { api, errorMessage } from '@/lib/api'
import type { SafetySession } from '@/lib/types'

const MIN_GAP_MS = 20_000

/**
 * While a session is live, sends the device position to the server at most every 20 seconds.
 * Browsers pause this when the app is in the background, so callers must tell the user to keep it open.
 */
export function useBeacon(sessionId: number | null, onUpdate: (s: SafetySession) => void) {
  const [lastSent, setLastSent] = useState<Date | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (sessionId === null) return
    if (!navigator.geolocation) return
    let last = 0
    const watch = navigator.geolocation.watchPosition(
      (p) => {
        const now = Date.now()
        if (now - last < MIN_GAP_MS) return
        last = now
        api<{ session: SafetySession }>(`/safety/${sessionId}/location`, { body: { latitude: p.coords.latitude, longitude: p.coords.longitude } })
          .then((r) => {
            setLastSent(new Date())
            setError('')
            onUpdate(r.session)
          })
          .catch((e: unknown) => setError(errorMessage(e)))
      },
      (err) => setError(err.code === err.PERMISSION_DENIED ? 'Location permission is blocked, so your position cannot be shared.' : 'Your position could not be read.'),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    )
    return () => navigator.geolocation.clearWatch(watch)
  }, [sessionId, onUpdate])

  return { lastSent, error }
}
