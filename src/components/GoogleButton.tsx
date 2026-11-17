import { useEffect, useRef, useState } from 'react'

interface GoogleId {
  initialize(config: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: 'popup'; auto_select?: boolean }): void
  renderButton(el: HTMLElement, options: Record<string, unknown>): void
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } }
  }
}

const SRC = 'https://accounts.google.com/gsi/client'
let loading: Promise<void> | null = null

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve()
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SRC
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => {
      loading = null
      reject(new Error('Google sign-in could not be loaded'))
    }
    document.head.appendChild(s)
  })
  return loading
}

/** Google's own "Sign in with Google" button. It returns an ID token that our server verifies. */
export function GoogleButton({ clientId, label, onCredential }: { clientId: string; label: 'signin_with' | 'signup_with'; onCredential: (credential: string) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const callback = useRef(onCredential)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    callback.current = onCredential
  }, [onCredential])

  useEffect(() => {
    const ctrl = new AbortController()
    loadGoogleScript()
      .then(() => {
        if (ctrl.signal.aborted || !box.current || !window.google) return
        window.google.accounts.id.initialize({ client_id: clientId, callback: (r) => callback.current(r.credential), ux_mode: 'popup' })
        window.google.accounts.id.renderButton(box.current, { type: 'standard', theme: 'outline', size: 'large', shape: 'pill', text: label, logo_alignment: 'left', width: Math.min(360, box.current.clientWidth || 320) })
      })
      .catch(() => !ctrl.signal.aborted && setFailed(true))
    return () => ctrl.abort()
  }, [clientId, label])

  if (failed) return <p role="status" className="text-center text-sm text-ink-soft">Google sign-in could not load. Check your connection, or use your username and password.</p>
  return <div ref={box} className="flex min-h-11 justify-center" aria-label="Continue with Google" />
}
