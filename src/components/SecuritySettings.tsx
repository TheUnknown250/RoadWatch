import { KeyRound, LogOut } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthContext'
import { errorMessage } from '@/lib/api'
import { field as val } from '@/lib/form'

const input = 'mt-1 h-11 w-full rounded-xl border border-line bg-white px-3 text-sm font-normal'

/** Password change (for username accounts) and sign-out-everywhere. */
export function SecuritySettings({ hasPassword }: { hasPassword: boolean }) {
  const auth = useAuth()
  const [busy, setBusy] = useState(false)

  async function change(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    const next = val(f, 'next')
    if (next !== val(f, 'again')) return void toast.error('The new passwords do not match')
    setBusy(true)
    try {
      await auth.changePassword(val(f, 'current'), next)
      form.reset()
      toast.success('Password changed. Other devices were signed out.')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="sec-h" className="space-y-4 rounded-3xl border border-line bg-white/80 p-5">
      <h2 id="sec-h" className="font-display text-base font-semibold">Sign-in and security</h2>
      {hasPassword ? (
        <form onSubmit={(e) => void change(e)} className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-semibold"><KeyRound size={15} aria-hidden /> Change password</p>
          <label className="block text-xs font-semibold text-ink-soft">Current password<input name="current" type="password" required autoComplete="current-password" className={input} /></label>
          <label className="block text-xs font-semibold text-ink-soft">New password<input name="next" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className={input} /></label>
          <label className="block text-xs font-semibold text-ink-soft">New password again<input name="again" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className={input} /></label>
          <button type="submit" disabled={busy} className="min-h-11 rounded-full bg-ink px-5 text-sm font-semibold text-white disabled:opacity-60">Change password</button>
        </form>
      ) : (
        <p className="text-sm text-ink-soft">You sign in with Google, so there is no RoadWatch password to manage.</p>
      )}
      <div className="border-t border-line pt-3">
        <p className="text-xs text-ink-soft">Lost a phone or used a shared device? This signs you out everywhere, including here.</p>
        <button type="button" onClick={() => { if (window.confirm('Sign out of every device?')) void auth.signOutEverywhere().catch((err: unknown) => toast.error(errorMessage(err))) }} className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-red-700"><LogOut size={15} aria-hidden /> Sign out of all devices</button>
      </div>
    </section>
  )
}
