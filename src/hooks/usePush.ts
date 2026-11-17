import { useCallback, useState } from 'react'
import { api } from '@/lib/api'
import { firebaseApp, firebaseConfig, firebaseConfigured, vapidKey } from '@/lib/firebase'

export type PushState = 'unsupported' | 'unconfigured' | 'denied' | 'idle' | 'enabled'

const TOKEN_KEY = 'roadwatch.fcmToken'

function initial(): PushState {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported'
  if (!firebaseConfigured || !vapidKey) return 'unconfigured'
  if (Notification.permission === 'denied') return 'denied'
  return Notification.permission === 'granted' && localStorage.getItem(TOKEN_KEY) ? 'enabled' : 'idle'
}

/** Opt-in browser push through Firebase Cloud Messaging. Never prompts without a user click. */
export function usePush() {
  const [state, setState] = useState<PushState>(initial)
  const [busy, setBusy] = useState(false)

  const enable = useCallback(async () => {
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'idle')
        return
      }
      const { getMessaging, getToken } = await import('firebase/messaging')
      const params = new URLSearchParams(Object.entries(firebaseConfig).filter((e): e is [string, string] => Boolean(e[1])))
      const registration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${params}`)
      const token = await getToken(getMessaging(firebaseApp()), { vapidKey, serviceWorkerRegistration: registration })
      await api('/me/devices', { body: { token } })
      localStorage.setItem(TOKEN_KEY, token)
      setState('enabled')
    } finally {
      setBusy(false)
    }
  }, [])

  const disable = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) await api('/me/devices', { method: 'DELETE', body: { token } })
    localStorage.removeItem(TOKEN_KEY)
    setState('idle')
  }, [])

  return { state, busy, enable, disable }
}
