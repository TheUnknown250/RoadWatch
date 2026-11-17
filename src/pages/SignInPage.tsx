import { useQuery } from '@tanstack/react-query'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { GoogleButton } from '@/components/GoogleButton'
import { api, errorMessage } from '@/lib/api'
import { field as val } from '@/lib/form'
import { Logo } from '@/components/Logo'

const input = 'mt-1 h-12 w-full rounded-xl border border-line bg-white px-3.5 text-base font-normal'

export default function SignInPage() {
  const auth = useAuth()
  const nav = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from
  const [tab, setTab] = useState<'in' | 'up'>('in')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [show, setShow] = useState(false)

  const { data: config } = useQuery({ queryKey: ['auth-config'], staleTime: Infinity, queryFn: () => api<{ googleClientId: string | null; passwordMin: number }>('/auth/config', { auth: false }) })

  useEffect(() => {
    if (auth.status === 'signedIn') nav(from ?? '/', { replace: true })
  }, [auth.status, from, nav])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const username = val(f, 'username').trim()
    const password = val(f, 'password')
    const name = val(f, 'name').trim()
    void run(() => (tab === 'in' ? auth.signIn(username, password) : auth.register({ username, password, displayName: name || undefined })))
  }

  function switchTab(next: 'in' | 'up') {
    setTab(next)
    setError('')
    setShow(false)
  }

  const signUp = tab === 'up'
  const min = config?.passwordMin ?? 8

  return (
    <div className="mx-auto max-w-md space-y-5 p-5">
      <header className="pt-4 text-center">
        <span className="mx-auto grid place-items-center"><Logo size={64} /></span>
        <h1 className="mt-4 text-balance font-display text-3xl font-bold tracking-[-0.03em]">{signUp ? 'Create your account' : 'Welcome back'}</h1>
        <p className="mt-1 text-pretty text-sm text-ink-soft">{from ? 'Sign in to continue. ' : ''}{signUp ? 'Join your community and help keep Nigerian roads safer.' : 'Sign in to report, verify and get alerts near you.'}</p>
      </header>

      <div role="tablist" aria-label="Sign in or create an account" className="grid grid-cols-2 gap-1 rounded-full bg-white p-1 ring-1 ring-inset ring-line">
        {([['in', 'Sign in'], ['up', 'Create account']] as const).map(([key, label]) => (
          <button key={key} role="tab" type="button" aria-selected={tab === key} onClick={() => switchTab(key)} className={`min-h-11 rounded-full text-sm font-semibold transition-colors ${tab === key ? 'bg-ink text-white' : 'text-ink-soft'}`}>{label}</button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-3xl border border-line bg-white/80 p-5" aria-label={signUp ? 'Create account' : 'Sign in'}>
        {signUp && (
          <label className="block text-sm font-semibold">Your name <span className="font-normal text-ink-faint">(optional)</span>
            <input name="name" autoComplete="name" maxLength={60} className={input} placeholder="Ada Obi" />
          </label>
        )}
        <label className="block text-sm font-semibold">Username
          <input name="username" required autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} minLength={signUp ? 3 : 1} maxLength={signUp ? 20 : 40} pattern={signUp ? '[A-Za-z0-9_.]{3,20}' : undefined} className={input} aria-describedby={signUp ? 'username-hint' : undefined} />
          {signUp && <span id="username-hint" className="mt-1 block text-xs font-normal text-ink-faint">3 to 20 letters, numbers, dots or underscores.</span>}
        </label>
        <label className="block text-sm font-semibold">Password
          <span className="relative block">
            <input name="password" required type={show ? 'text' : 'password'} autoComplete={signUp ? 'new-password' : 'current-password'} minLength={signUp ? min : 1} maxLength={128} className={`${input} pr-12`} aria-describedby={signUp ? 'password-hint' : undefined} />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} className="absolute right-1 top-2 grid size-11 place-items-center text-ink-soft">{show ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}</button>
          </span>
          {signUp && <span id="password-hint" className="mt-1 block text-xs font-normal text-ink-faint">At least {min} characters. A few random words make a strong password.</span>}
        </label>

        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

        <button type="submit" disabled={busy} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-ink text-base font-semibold text-white disabled:opacity-60">
          {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
          {signUp ? 'Create account' : 'Sign in'}
        </button>
        {!signUp && <p className="text-center text-xs text-ink-faint">Forgot your password? Username accounts have no email on file, so it cannot be reset by email yet. Signing in with Google avoids passwords altogether.</p>}
      </form>

      {config?.googleClientId && (
        <div className="space-y-3">
          <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.1em] text-ink-faint"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></p>
          <GoogleButton clientId={config.googleClientId} label={signUp ? 'signup_with' : 'signin_with'} onCredential={(c) => void run(() => auth.signInWithGoogle(c))} />
        </div>
      )}

      <p className="text-center text-xs text-ink-faint">By continuing you agree to the <Link to="/privacy" className="font-semibold text-focus underline">terms and privacy notice</Link>. RoadWatch never posts for you.</p>
    </div>
  )
}
