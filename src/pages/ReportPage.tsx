import { useQueryClient } from '@tanstack/react-query'
import { Crosshair, Loader2 } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthContext'
import { IncidentMap } from '@/components/IncidentMap'
import { useCategories } from '@/hooks/useIncidents'
import { useOnline } from '@/hooks/useOnline'
import { api, ApiError, errorMessage } from '@/lib/api'
import { field as val } from '@/lib/form'
import { toLocalInput } from '@/lib/format'
import { insideNigeria, NIGERIAN_STATES } from '@/lib/nigeria'
import { enqueueReport } from '@/lib/reportQueue'
import type { Incident, NewReport } from '@/lib/types'

const field = 'mt-1 w-full rounded-xl border border-line bg-white px-3.5 text-base placeholder:text-ink-faint'
const label = 'block text-sm font-semibold text-ink'

export default function ReportPage() {
  const { me, status } = useAuth()
  const online = useOnline()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { data: categories = [] } = useCategories()
  // One key per form so a retry or double tap can never create two incidents.
  const key = useRef(crypto.randomUUID())

  const [pin, setPin] = useState<[number, number] | null>(null)
  const [locating, setLocating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [occurredAt, setOccurredAt] = useState(() => toLocalInput(new Date()))
  const [maxTime] = useState(() => toLocalInput(new Date()))

  if (status === 'loading') return null
  if (!me) {
    return (
      <div className="space-y-3 p-6 text-center">
        <h1 className="font-display text-xl font-bold">Sign in to report</h1>
        <p className="text-ink-soft">Accounts help the community trust reports and stop abuse.</p>
        <Link to="/signin" state={{ from: '/report' }} className="inline-flex min-h-12 items-center rounded-full bg-ink px-6 font-semibold text-white">Sign in or register</Link>
      </div>
    )
  }

  function locate() {
    if (!navigator.geolocation) return setError('Location is not available on this device. Tap the map instead.')
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false)
        setPin([p.coords.latitude, p.coords.longitude])
      },
      () => {
        setLocating(false)
        setError('Could not get your location. Tap the map to place the pin instead.')
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    if (!pin) return setError('Tap the map or use your location to mark where it happened.')
    if (!insideNigeria(pin[0], pin[1])) return setError('The pin must be inside Nigeria.')
    const f = new FormData(e.currentTarget)
    const report: NewReport = {
      categorySlug: val(f, 'category'),
      title: val(f, 'title').trim(),
      description: val(f, 'description').trim(),
      latitude: Number(pin[0].toFixed(6)),
      longitude: Number(pin[1].toFixed(6)),
      addressText: val(f, 'address').trim() || undefined,
      state: val(f, 'state').trim() || undefined,
      occurredAt: new Date(occurredAt).toISOString(),
      idempotencyKey: key.current,
      isAnonymous: f.get('anonymous') === 'on',
    }
    const saveOffline = () => {
      enqueueReport(me!.id, report)
      toast.success('Saved on this device. It will be sent when you are back online.')
      nav('/')
    }
    if (!online) return saveOffline()
    setBusy(true)
    try {
      const res = await api<{ incident: Incident }>('/incidents', { body: report })
      void qc.invalidateQueries({ queryKey: ['incidents'] })
      toast.success('Report submitted. Thank you for helping other road users.')
      nav(`/incidents/${res.incident.id}`)
    } catch (err) {
      if (err instanceof ApiError && err.isOffline) saveOffline()
      else setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-5 p-4" noValidate>
      <h1 className="font-display text-2xl font-bold tracking-tight">Report an incident</h1>

      <div>
        <p className={label}>Where did it happen?</p>
        <div className="mt-2 overflow-hidden rounded-2xl border border-line">
          <IncidentMap incidents={[]} onPick={(la, ln) => setPin([la, ln])} pinned={pin} fit={false} className="h-64 w-full" />
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <button type="button" onClick={locate} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold ring-1 ring-inset ring-line">
            {locating ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Crosshair size={15} aria-hidden />} Use my location
          </button>
          <p className="text-xs tabular-nums text-ink-faint" aria-live="polite">{pin ? `${pin[0].toFixed(5)}, ${pin[1].toFixed(5)}` : 'No pin yet. Tap the map.'}</p>
        </div>
      </div>

      <label className={label}>
        Category
        <select name="category" required defaultValue="" className={`${field} h-12`}>
          <option value="" disabled>Choose a category</option>
          {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
      </label>
      <label className={label}>
        Short title
        <input name="title" required minLength={3} maxLength={120} placeholder="e.g. Armed men stopping cars near the bridge" className={`${field} h-12`} />
      </label>
      <label className={label}>
        What happened?
        <textarea name="description" required minLength={10} maxLength={2000} rows={4} placeholder="Describe what you saw. Do not include names or phone numbers." className={`${field} py-3`} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          State
          <input name="state" list="ng-states" maxLength={60} placeholder="Lagos" className={`${field} h-12`} />
          <datalist id="ng-states">{NIGERIAN_STATES.map((s) => <option key={s} value={s} />)}</datalist>
        </label>
        <label className={label}>
          Road or landmark
          <input name="address" maxLength={200} placeholder="Lekki-Epe Expressway" className={`${field} h-12`} />
        </label>
      </div>
      <label className={label}>
        When did it happen?
        <input type="datetime-local" required value={occurredAt} max={maxTime} onChange={(e) => setOccurredAt(e.target.value)} className={`${field} h-12`} />
      </label>

      <label className="flex items-start gap-3 rounded-2xl border border-line bg-white/80 p-4">
        <input name="anonymous" type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[#0F1B33]" />
        <span className="text-sm"><span className="font-semibold">Report anonymously</span><span className="block text-xs text-ink-soft">Other users will see "Anonymous" instead of your name. Moderators can still see who reported, to stop abuse.</span></span>
      </label>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      <button type="submit" disabled={busy} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-ink text-base font-semibold text-white disabled:opacity-60">
        {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
        {online ? 'Submit report' : 'Save to send later'}
      </button>
      <p className="text-center text-xs text-ink-faint">In an emergency, call 112 first. RoadWatch is not an emergency service.</p>
    </form>
  )
}
