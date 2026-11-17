import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, SESSION_EXPIRED_EVENT, setTokenGetter } from '@/lib/api'
import type { Me } from '@/lib/types'

type Status = 'loading' | 'signedOut' | 'signedIn'

interface Session {
  token: string
}

interface AuthValue {
  status: Status
  me: Me | null
  signIn(username: string, password: string): Promise<void>
  register(input: { username: string; password: string; displayName?: string }): Promise<void>
  signInWithGoogle(credential: string): Promise<void>
  signOut(): Promise<void>
  /** Ends every session of this account, including other devices. */
  signOutEverywhere(): Promise<void>
  changePassword(currentPassword: string, newPassword: string): Promise<void>
  /** Erases personal data on the server and signs out. */
  deleteAccount(): Promise<void>
  updateName(displayName: string): Promise<void>
}

const Ctx = createContext<AuthValue | null>(null)
const TOKEN_KEY = 'roadwatch.session'

const readToken = (): string | null => localStorage.getItem(TOKEN_KEY)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(() => (readToken() ? 'loading' : 'signedOut'))
  const [me, setMe] = useState<Me | null>(null)

  const clear = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setMe(null)
    setStatus('signedOut')
  }, [])

  const loadMe = useCallback(async () => {
    try {
      setMe((await api<{ user: Me }>('/me')).user)
      setStatus('signedIn')
    } catch {
      clear()
    }
  }, [clear])

  const start = useCallback(
    async (s: Session) => {
      localStorage.setItem(TOKEN_KEY, s.token)
      await loadMe()
    },
    [loadMe],
  )

  useEffect(() => {
    setTokenGetter(() => Promise.resolve(readToken()))
    const expired = () => clear()
    window.addEventListener(SESSION_EXPIRED_EVENT, expired)
    // Sign out in this tab when another tab signs out or changes the session.
    const storage = (e: StorageEvent) => {
      if (e.key === TOKEN_KEY && !e.newValue) clear()
    }
    window.addEventListener('storage', storage)
    if (readToken()) {
      api<{ user: Me }>('/me')
        .then((r) => {
          setMe(r.user)
          setStatus('signedIn')
        })
        .catch(() => clear())
    }
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, expired)
      window.removeEventListener('storage', storage)
    }
  }, [clear])

  const value = useMemo<AuthValue>(
    () => ({
      status,
      me,
      async signIn(username, password) {
        await start(await api<Session>('/auth/login', { body: { username, password }, auth: false }))
      },
      async register(input) {
        await start(await api<Session>('/auth/register', { body: input, auth: false }))
      },
      async signInWithGoogle(credential) {
        await start(await api<Session>('/auth/google', { body: { credential }, auth: false }))
      },
      signOut() {
        clear()
        return Promise.resolve()
      },
      async signOutEverywhere() {
        await api('/auth/logout-all', { body: {} })
        clear()
      },
      async changePassword(currentPassword, newPassword) {
        const r = await api<Session>('/auth/password', { body: { currentPassword, newPassword } })
        localStorage.setItem(TOKEN_KEY, r.token) // other devices are signed out; this one continues
      },
      async deleteAccount() {
        await api('/me', { method: 'DELETE' })
        clear()
      },
      async updateName(displayName) {
        await api('/me', { method: 'PATCH', body: { displayName } })
        setMe((m) => (m ? { ...m, displayName } : m))
      },
    }),
    [status, me, start, clear],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used inside AuthProvider')
  return v
}
