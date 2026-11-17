import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Briefcase, GraduationCap, Home, MapPin, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { api, errorMessage } from '@/lib/api'
import type { PlaceResult, SavedPlace } from '@/lib/types'
import { PlaceSearch } from './PlaceSearch'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const ICON = { home: Home, work: Briefcase, school: GraduationCap, other: MapPin }

export function SavedPlaces() {
  const qc = useQueryClient()
  const [spot, setSpot] = useState<PlaceResult | null>(null)
  const [label, setLabel] = useState('')
  const [kind, setKind] = useState<SavedPlace['kind']>('work')
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [arriveBy, setArriveBy] = useState('')

  const { data } = useQuery({ queryKey: ['places'], queryFn: () => api<{ places: SavedPlace[] }>('/me/places') })
  const add = useMutation({
    mutationFn: () => api('/me/places', { body: { label: label.trim(), kind, latitude: spot!.lat, longitude: spot!.lng, addressText: spot!.label.slice(0, 200), typicalDays: days, arriveBy: arriveBy || undefined } }),
    onSuccess: () => {
      setSpot(null); setLabel(''); setArriveBy('')
      toast.success('Place saved')
      void qc.invalidateQueries({ queryKey: ['places'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const remove = useMutation({
    mutationFn: (id: number) => api(`/me/places/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['places'] }),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (spot && label.trim()) add.mutate()
  }

  return (
    <section aria-labelledby="places-h" className="space-y-3 rounded-3xl border border-line bg-white/80 p-5">
      <h2 id="places-h" className="font-display text-base font-semibold">Saved places</h2>
      <p className="text-xs text-ink-soft">Add where you go regularly and when you need to arrive. Trip Suggestions uses this to tell you when to leave.</p>
      <ul className="space-y-2">
        {data?.places.map((p) => {
          const Icon = ICON[p.kind]
          return (
            <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl bg-canvas px-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2"><Icon size={15} className="shrink-0 text-ink-faint" aria-hidden /><span className="min-w-0"><span className="block truncate font-medium">{p.label}</span><span className="block text-xs tabular-nums text-ink-faint">{p.arriveBy ? `Arrive by ${p.arriveBy}${p.typicalDays.length ? ` · ${p.typicalDays.map((d) => DAYS[d]).join(', ')}` : ''}` : 'No schedule'}</span></span></span>
              <button type="button" onClick={() => remove.mutate(p.id)} aria-label={`Remove ${p.label}`} className="grid size-11 shrink-0 place-items-center text-ink-faint"><Trash2 size={16} aria-hidden /></button>
            </li>
          )
        })}
        {data?.places.length === 0 && <li className="text-sm text-ink-soft">No saved places yet.</li>}
      </ul>

      <form onSubmit={submit} className="space-y-3 border-t border-line pt-3">
        {spot ? (
          <p className="rounded-xl bg-canvas px-3 py-2 text-sm"><strong className="font-semibold">Place:</strong> {spot.label} <button type="button" onClick={() => setSpot(null)} className="ml-2 font-semibold text-focus underline">Change</button></p>
        ) : (
          <PlaceSearch label="Search for a place to save" onSelect={(p) => { setSpot(p); if (!label) setLabel(p.label.split(',')[0]) }} />
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-ink-soft">Name<input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} required className="mt-1 h-11 w-full rounded-xl border border-line bg-white px-3 text-sm font-normal" /></label>
          <label className="text-xs font-semibold text-ink-soft">Type
            <select value={kind} onChange={(e) => setKind(e.target.value as SavedPlace['kind'])} className="mt-1 h-11 w-full rounded-xl border border-line bg-white px-2 text-sm font-normal"><option value="home">Home</option><option value="work">Work</option><option value="school">School</option><option value="other">Other</option></select>
          </label>
        </div>
        <label className="block text-xs font-semibold text-ink-soft">Usually arrive by (optional)<input type="time" value={arriveBy} onChange={(e) => setArriveBy(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-line bg-white px-3 text-sm font-normal" /></label>
        <fieldset>
          <legend className="text-xs font-semibold text-ink-soft">On these days</legend>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {DAYS.map((d, i) => (
              <button key={d} type="button" aria-pressed={days.includes(i)} onClick={() => setDays((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]))} className={`min-h-11 min-w-12 rounded-full px-3 text-sm font-medium ring-1 ring-inset ${days.includes(i) ? 'bg-ink text-white ring-ink' : 'bg-white text-ink-soft ring-line'}`}>{d}</button>
            ))}
          </div>
        </fieldset>
        <button type="submit" disabled={!spot || !label.trim() || add.isPending} className="min-h-11 rounded-full bg-ink px-5 text-sm font-semibold text-white disabled:opacity-50">Save place</button>
      </form>
    </section>
  )
}
