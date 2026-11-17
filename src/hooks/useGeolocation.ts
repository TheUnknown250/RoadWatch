import { useCallback, useEffect, useState } from 'react'
import type { LatLng } from '@/lib/types'

export type GeoStatus = 'idle' | 'locating' | 'ready' | 'denied' | 'unavailable'

const KEY = 'roadwatch.lastCoords'

function readLast(): LatLng | null {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as LatLng | null
  } catch {
    return null
  }
}

/** One-shot position request. Only prompts after a user action unless permission was already granted. */
export function useGeolocation(autoIfGranted = false) {
  const [coords, setCoords] = useState<LatLng | null>(readLast)
  const [status, setStatus] = useState<GeoStatus>(() => (readLast() ? 'ready' : 'idle'))

  const request = useCallback((): Promise<LatLng | null> => {
    if (!navigator.geolocation) {
      setStatus('unavailable')
      return Promise.resolve(null)
    }
    setStatus('locating')
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const c = { lat: p.coords.latitude, lng: p.coords.longitude }
          sessionStorage.setItem(KEY, JSON.stringify(c))
          setCoords(c)
          setStatus('ready')
          resolve(c)
        },
        (err) => {
          setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable')
          resolve(null)
        },
        { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
      )
    })
  }, [])

  useEffect(() => {
    if (!autoIfGranted || !navigator.permissions) return
    void navigator.permissions.query({ name: 'geolocation' }).then((p) => {
      if (p.state === 'granted') void request()
    })
  }, [autoIfGranted, request])

  return { coords, status, request, setCoords }
}
