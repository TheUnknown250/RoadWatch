import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MapPinPlus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api, errorMessage } from '@/lib/api'
import type { Subscription } from '@/lib/types'

export function AreaSubscriptions() {
  const qc = useQueryClient()
  const [radiusKm, setRadiusKm] = useState(10)
  const [label, setLabel] = useState('')
  const key = ['subscriptions']
  const { data } = useQuery({ queryKey: key, queryFn: () => api<{ subscriptions: Subscription[] }>('/me/subscriptions') })

  const add = useMutation({
    mutationFn: (pos: { latitude: number; longitude: number }) =>
      api('/me/subscriptions', { body: { ...pos, radiusKm, label: label.trim() || undefined } }),
    onSuccess: () => {
      setLabel('')
      toast.success('You will be alerted about new incidents in this area')
      void qc.invalidateQueries({ queryKey: key })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const remove = useMutation({
    mutationFn: (id: number) => api(`/me/subscriptions/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  })

  function followHere() {
    if (!navigator.geolocation) return void toast.error('Location is not available on this device')
    navigator.geolocation.getCurrentPosition(
      (p) => add.mutate({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      () => toast.error('Could not get your location. Check browser permissions.'),
      { timeout: 10_000 },
    )
  }

  return (
    <section aria-labelledby="areas-h" className="space-y-3 rounded-3xl border border-line bg-white/80 p-5">
      <h2 id="areas-h" className="font-display text-base font-semibold">Areas you follow</h2>
      <ul className="space-y-2">
        {data?.subscriptions.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl bg-canvas px-3 py-2 text-sm">
            <span className="tabular-nums">{s.label || `${s.latitude.toFixed(3)}, ${s.longitude.toFixed(3)}`} <span className="text-ink-faint">({s.radiusKm} km)</span></span>
            <button type="button" onClick={() => remove.mutate(s.id)} className="grid size-11 place-items-center text-ink-faint" aria-label={`Stop following ${s.label ?? 'this area'}`}><Trash2 size={16} aria-hidden /></button>
          </li>
        ))}
        {data?.subscriptions.length === 0 && <li className="text-sm text-ink-soft">You are not following any area yet.</li>}
      </ul>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <label className="text-xs font-semibold text-ink-soft">Name (optional)
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="Home, Work" className="mt-1 h-11 w-full rounded-xl border border-line bg-white px-3 text-sm font-normal" />
        </label>
        <label className="text-xs font-semibold text-ink-soft">Radius
          <select value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} className="mt-1 h-11 w-full rounded-xl border border-line bg-white px-2 text-sm font-normal">
            {[2, 5, 10, 25, 50].map((r) => <option key={r} value={r}>{r} km</option>)}
          </select>
        </label>
      </div>
      <button type="button" onClick={followHere} disabled={add.isPending} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-white disabled:opacity-60">
        <MapPinPlus size={16} aria-hidden /> Follow my current location
      </button>
    </section>
  )
}
