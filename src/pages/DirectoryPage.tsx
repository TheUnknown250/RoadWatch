import { useQuery } from '@tanstack/react-query'
import { BadgeCheck, CircleAlert, Crosshair, ExternalLink, Flame, Hospital, Loader2, Phone, Shield } from 'lucide-react'
import { useState } from 'react'
import { useGeolocation } from '@/hooks/useGeolocation'
import { api, errorMessage } from '@/lib/api'
import { formatKm } from '@/lib/format'
import { insideNigeria, NIGERIAN_STATES } from '@/lib/nigeria'
import type { DirectoryContact, NearbyService } from '@/lib/types'

const KIND_LABEL: Record<string, string> = { general: 'All emergencies', police: 'Police', fire: 'Fire', ambulance: 'Ambulance', road: 'Road safety', disaster: 'Disaster response', hospital: 'Hospital' }
const NEAR_ICON = { hospital: Hospital, police: Shield, fire: Flame }
const NEAR_LABEL = { hospital: 'Hospital', police: 'Police station', fire: 'Fire station' }

function callable(phone: string): string {
  return `tel:${phone.replace(/[^0-9+]/g, '')}`
}

export default function DirectoryPage() {
  const [state, setState] = useState('')
  const geo = useGeolocation()
  const { data, isError } = useQuery({ queryKey: ['directory', state], queryFn: () => api<{ contacts: DirectoryContact[] }>(`/directory${state ? `?state=${encodeURIComponent(state)}` : ''}`, { auth: false }) })

  const here = geo.coords && insideNigeria(geo.coords.lat, geo.coords.lng) ? geo.coords : null
  const near = useQuery({
    queryKey: ['nearby', here && Math.round(here.lat * 50), here && Math.round(here.lng * 50)],
    enabled: Boolean(here),
    retry: false,
    staleTime: 30 * 60_000,
    queryFn: () => api<{ services: NearbyService[]; partial: boolean; attribution: string }>(`/directory/nearby?lat=${here!.lat}&lng=${here!.lng}&radiusKm=8`, { auth: false }),
  })

  return (
    <div className="space-y-5 p-4">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight">Emergency numbers</h1>
        <p className="mt-1 text-pretty text-sm text-ink-soft">Tap a number to call. Save the important ones in your phone before you need them.</p>
      </header>

      <label className="block text-sm font-semibold">Show numbers for
        <select value={state} onChange={(e) => setState(e.target.value)} className="mt-1 h-12 w-full rounded-xl border border-line bg-white px-3 text-base font-normal">
          <option value="">Nationwide</option>
          {NIGERIAN_STATES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>

      {isError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">The directory could not be loaded. If this is an emergency, call 112.</p>}
      <ul className="space-y-3">
        {data?.contacts.map((c) => (
          <li key={c.id} className="rounded-2xl border border-line bg-white/80 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-soft">{KIND_LABEL[c.kind] ?? c.kind}{c.state ? ` · ${c.state}` : ''}</p>
                <p className="font-display text-base font-semibold">{c.name}</p>
                {c.description && <p className="mt-0.5 text-pretty text-xs text-ink-soft">{c.description}</p>}
                <p className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${c.verified ? 'text-emerald-800' : 'text-amber-800'}`}>
                  {c.verified ? <BadgeCheck size={13} aria-hidden /> : <CircleAlert size={13} aria-hidden />}
                  {c.verified ? 'Confirmed from an official source' : 'Listed by a third-party directory. Confirm with the agency.'}
                  {c.sourceUrl && <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center gap-0.5 underline">Source <ExternalLink size={11} aria-hidden /></a>}
                </p>
              </div>
              <a href={callable(c.phone)} className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-ink px-5 font-display text-lg font-bold tabular-nums text-white" aria-label={`Call ${c.name} on ${c.phone}`}><Phone size={16} aria-hidden /> {c.phone}</a>
            </div>
          </li>
        ))}
      </ul>

      <section aria-labelledby="near-h" className="space-y-3">
        <h2 id="near-h" className="font-display text-base font-semibold">Hospitals, police and fire stations near you</h2>
        {!here && (
          <button type="button" onClick={() => void geo.request()} disabled={geo.status === 'locating'} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-6 font-semibold ring-1 ring-inset ring-line">
            {geo.status === 'locating' ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Crosshair size={16} aria-hidden />} Find services near me
          </button>
        )}
        {geo.status === 'denied' && <p role="alert" className="text-sm text-red-800">Location is blocked. Allow it in your browser settings to see nearby services.</p>}
        {geo.coords && !here && <p className="text-sm text-ink-soft">Your location is outside Nigeria, so no services can be shown.</p>}
        {near.isFetching && <p role="status" className="text-sm text-ink-soft">Looking up nearby services</p>}
        {near.isError && <p role="alert" className="text-sm text-red-800">{errorMessage(near.error)}</p>}
        <ul className="space-y-2">
          {near.data?.services.map((s) => {
            const Icon = NEAR_ICON[s.kind]
            return (
              <li key={`${s.kind}-${s.lat}-${s.lng}`} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white/80 p-3">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-canvas"><Icon size={18} aria-hidden /></span>
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold">{s.label}</span><span className="block text-xs tabular-nums text-ink-soft">{NEAR_LABEL[s.kind]} · {formatKm(s.distanceM)} away</span></span>
                </span>
                <span className="flex shrink-0 gap-2">
                  {s.phone && <a href={callable(s.phone)} aria-label={`Call ${s.label}`} className="grid size-11 place-items-center rounded-full bg-ink text-white"><Phone size={16} aria-hidden /></a>}
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`} target="_blank" rel="noopener noreferrer" aria-label={`Directions to ${s.label}`} className="grid size-11 place-items-center rounded-full bg-white ring-1 ring-inset ring-line"><ExternalLink size={16} aria-hidden /></a>
                </span>
              </li>
            )
          })}
        </ul>
        {near.data && near.data.services.length === 0 && <p className="text-sm text-ink-soft">No services were found within 8 km on OpenStreetMap. Call 112.</p>}
        {near.data?.partial && <p className="text-xs text-ink-faint">Some service types could not be loaded.</p>}
        {near.data && <p className="text-xs text-ink-faint">{near.data.attribution}. Many places have no phone number listed, so use Directions or call 112.</p>}
      </section>
    </div>
  )
}
