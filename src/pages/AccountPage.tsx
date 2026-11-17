import { useQuery } from '@tanstack/react-query'
import { BellRing, LogOut, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthContext'
import { SecuritySettings } from '@/components/SecuritySettings'
import { AreaSubscriptions } from '@/components/AreaSubscriptions'
import { IncidentCard } from '@/components/IncidentCard'
import { usePush } from '@/hooks/usePush'
import { api, errorMessage } from '@/lib/api'
import type { Incident } from '@/lib/types'

export default function AccountPage() {
  const auth = useAuth()
  const push = usePush()
  const [name, setName] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const { data: mine } = useQuery({
    queryKey: ['my-incidents'],
    enabled: Boolean(auth.me),
    queryFn: () => api<{ incidents: Incident[] }>('/me/incidents'),
  })

  if (auth.status === 'loading') return null
  if (!auth.me) {
    return (
      <div className="space-y-3 p-6 text-center">
        <h1 className="font-display text-xl font-bold">Your account</h1>
        <p className="text-ink-soft">Sign in to report incidents, verify reports and get alerts.</p>
        <Link to="/signin" className="inline-flex min-h-12 items-center rounded-full bg-ink px-6 font-semibold text-white">Sign in or register</Link>
      </div>
    )
  }
  const me = auth.me

  async function rename(e: FormEvent) {
    e.preventDefault()
    try {
      await auth.updateName(name.trim())
      setName('')
      toast.success('Name updated')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  async function removeAccount(e: FormEvent) {
    e.preventDefault()
    if (confirmText !== 'DELETE') return
    try {
      await auth.deleteAccount()
      toast.success('Your account and personal data were deleted')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const pushLabel = {
    unsupported: 'Push alerts are not supported on this browser.',
    unconfigured: 'Push alerts are not set up for this deployment.',
    denied: 'Notifications are blocked. Allow them in your browser settings to turn this on.',
    idle: 'Get a notification on this device when something happens in your areas.',
    enabled: 'Push alerts are on for this device.',
  }[push.state]

  return (
    <div className="space-y-4 p-4">
      <section className="space-y-3 rounded-3xl border border-line bg-white/80 p-5">
        <h1 className="font-display text-2xl font-bold tracking-tight">{me.displayName}</h1>
        <p className="text-sm text-ink-soft">{me.email ?? 'Username account'} <span className="capitalize">· {me.role}</span> · <span className="tabular-nums">{me.reputation}</span> verified reports</p>
        <form onSubmit={(e) => void rename(e)} className="flex gap-2">
          <label className="sr-only" htmlFor="newname">New display name</label>
          <input id="newname" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={60} required placeholder="Change display name" className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-white px-3 text-sm" />
          <button type="submit" className="min-h-11 rounded-full bg-ink px-5 text-sm font-semibold text-white">Save</button>
        </form>
      </section>

      <section className="space-y-3 rounded-3xl border border-line bg-white/80 p-5">
        <h2 className="font-display text-base font-semibold">Push alerts</h2>
        <p className="text-sm text-ink-soft">{pushLabel}</p>
        {(push.state === 'idle' || push.state === 'enabled') && (
          <button
            type="button"
            disabled={push.busy}
            onClick={() => void (push.state === 'enabled' ? push.disable() : push.enable()).catch((e) => toast.error(errorMessage(e)))}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold ring-1 ring-inset ring-line disabled:opacity-60"
          >
            <BellRing size={16} aria-hidden /> {push.state === 'enabled' ? 'Turn off' : 'Turn on'}
          </button>
        )}
      </section>

      <AreaSubscriptions />

      <section aria-labelledby="mine-h" className="space-y-3">
        <h2 id="mine-h" className="font-display text-base font-semibold">Your reports</h2>
        {mine?.incidents.length === 0 && <p className="text-sm text-ink-soft">You have not reported anything yet.</p>}
        {mine?.incidents.map((i) => <IncidentCard key={i.id} incident={i} />)}
      </section>

      <SecuritySettings hasPassword={me.hasPassword} />

      <section aria-labelledby="danger-h" className="space-y-3 rounded-3xl border border-red-200 bg-red-50/60 p-5">
        <h2 id="danger-h" className="font-display text-base font-semibold text-red-900">Delete account</h2>
        <p className="text-sm text-red-900/80">Removes your email, followed areas, alerts and sign-in. Reports and comments you posted stay public as "Deleted user". This cannot be undone.</p>
        <form onSubmit={(e) => void removeAccount(e)} className="flex gap-2">
          <label className="sr-only" htmlFor="confirm-delete">Type DELETE to confirm</label>
          <input id="confirm-delete" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="Type DELETE" autoComplete="off" className="h-11 min-w-0 flex-1 rounded-xl border border-red-200 bg-white px-3 text-sm" />
          <button type="submit" disabled={confirmText !== 'DELETE'} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-red-700 px-5 text-sm font-semibold text-white disabled:opacity-40"><Trash2 size={15} aria-hidden /> Delete</button>
        </form>
      </section>

      <p className="text-center text-sm"><Link to="/settings" className="font-semibold text-focus underline">Settings</Link> · <Link to="/communities" className="font-semibold text-focus underline">Communities</Link> · <Link to="/help" className="font-semibold text-focus underline">Help</Link> · <Link to="/privacy" className="font-semibold text-focus underline">Privacy and terms</Link></p>

      <button type="button" onClick={() => void auth.signOut()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-white font-semibold text-ink ring-1 ring-inset ring-line">
        <LogOut size={16} aria-hidden /> Sign out
      </button>
    </div>
  )
}
