import { useEffect } from 'react'

interface MotionPermission {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

/** iOS asks for motion access; other browsers grant it implicitly. Must be called from a tap. */
export async function requestMotionAccess(): Promise<boolean> {
  if (typeof DeviceMotionEvent === 'undefined') return false
  const ask = (DeviceMotionEvent as unknown as MotionPermission).requestPermission
  if (!ask) return true
  try {
    return (await ask()) === 'granted'
  } catch {
    return false
  }
}

/** Fires after four hard shakes within 1.5 seconds (about 3 g). Only works while the app is open. */
export function useShake(enabled: boolean, onShake: () => void) {
  useEffect(() => {
    if (!enabled) return
    let hits: number[] = []
    const handler = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity
      if (!a) return
      if (Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0) < 28) return
      const now = Date.now()
      hits = [...hits.filter((t) => now - t < 1500), now]
      if (hits.length >= 4) {
        hits = []
        onShake()
      }
    }
    window.addEventListener('devicemotion', handler)
    return () => window.removeEventListener('devicemotion', handler)
  }, [enabled, onShake])
}
