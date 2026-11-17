import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Navigation } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useGeolocation } from '@/hooks/useGeolocation'
import { api, errorMessage } from '@/lib/api'
import type { Community, SavedPlace, SafetySession } from '@/lib/types'
import { LocationField, type Spot } from './LocationField'

/** Starts a monitored trip: friends are told if you do not arrive on time. */
export function TripMonitorForm({ initialDestination, initialMinutes }: { initialDestination: Spot | null; initialMinutes: number }) {
  const qc = useQueryClient()
  const geo = useGeolocation()
  const [dest, setDest] = useState<Spot | null>(initialDestination)
  const [minutes, setMinutes] = useState(initialMinutes)
  const [grace, setGrace] = useState(15)
  const [chosen, setChosen] = useState<number[] | null>(null)

  const { data: comms } = useQuery({ queryKey: ['communities'], queryFn: () => api<{ communities: Community[] }>('/communities') })
  const { data: places } = useQuery({ queryKey: ['places'], queryFn: () => api<{ places: SavedPlace[] }>('/me/places') })
  const ids = chosen ?? comms?.communities.map((c) => c.id) ?? []

  const start = useMutation({
    mutationFn: async () => {
      const here = await geo.request()
      if (!here) throw new Error('We need your current location to start. Allow location access and try again.')
      return api<{ session: SafetySession }>('/safety/trips', {
        body: {
          latitude: here.lat, longitude: here.lng, destination: { lat: dest!.lat, lng: dest!.lng }, destinationLabel: dest!.label.slice(0, 120),
          expectedArrivalAt: new Date(Date.now() + minutes * 60_000).toISOString(), graceMinutes: grace, communityIds: ids,
        },
      })
    },
    onSuccess: () => {
      toast.success('Trip sharing started')
      void qc.invalidateQueries({ queryKey: ['safety'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  return (
    <section aria-labelledby="trip-h" className="space-y-4 rounded-3xl border border-line bg-white/80 p-5">
      <div>
        <h2 id="trip-h" className="font-display text-lg font-semibold">Safety monitor</h2>
        <p className="mt-1 text-pretty text-sm text-ink-soft">Share a trip with your communities. They see your live location, and are alerted if you have not arrived in time.</p>
      </div>
      <LocationField title="Where are you going?" value={dest} onChange={setDest} saved={places?.places} allowCurrent={false} />
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm font-semibold">Arriving in
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="mt-1 h-12 w-full rounded-xl border border-line bg-white px-3 text-base font-normal">
            {[...new Set([15, 30, 45, 60, 90, 120, 180, 240, 360, minutes])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold">Alert me late after
          <select value={grace} onChange={(e) => setGrace(Number(e.target.value))} className="mt-1 h-12 w-full rounded-xl border border-line bg-white px-3 text-base font-normal">
            {[10, 15, 30, 60].map((m) => <option key={m} value={m}>{m} min</option>)}
          </select>
        </label>
      </div>
      <fieldset>
        <legend className="text-sm font-semibold">Share with</legend>
        {comms?.communities.length ? (
          <ul className="mt-1 space-y-1">
            {comms.communities.map((c) => (
              <li key={c.id}>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input type="checkbox" className="size-5 accent-[#0F1B33]" checked={ids.includes(c.id)} onChange={(e) => setChosen(e.target.checked ? [...ids, c.id] : ids.filter((x) => x !== c.id))} />
                  {c.name} <span className="text-xs text-ink-faint tabular-nums">({c.memberCount})</span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-ink-soft">You are not in a community yet, so nobody would be told. Join or create one on the Communities page.</p>
        )}
      </fieldset>
      <button type="button" disabled={!dest || start.isPending} onClick={() => start.mutate()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-ink font-semibold text-white disabled:opacity-50">
        {start.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Navigation size={16} aria-hidden />} Start sharing this trip
      </button>
    </section>
  )
}
