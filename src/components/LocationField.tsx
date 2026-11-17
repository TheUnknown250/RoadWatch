import { Crosshair, Loader2, MapPin, X } from 'lucide-react'
import { useGeolocation } from '@/hooks/useGeolocation'
import { insideNigeria } from '@/lib/nigeria'
import type { LatLng, SavedPlace } from '@/lib/types'
import { PlaceSearch } from './PlaceSearch'

export interface Spot extends LatLng {
  label: string
}

interface Props {
  title: string
  value: Spot | null
  onChange: (s: Spot | null) => void
  saved?: SavedPlace[]
  /** Offer the "use my location" shortcut. */
  allowCurrent?: boolean
  hint?: string
}

/** Choose a place by current location, search, or a saved place. Map taps are handled by the page. */
export function LocationField({ title, value, onChange, saved = [], allowCurrent = true, hint }: Props) {
  const geo = useGeolocation()

  async function locateMe() {
    const c = await geo.request()
    if (c && insideNigeria(c.lat, c.lng)) onChange({ ...c, label: 'My location' })
    else if (c) onChange(null)
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">{title}</legend>
      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 py-2">
          <p className="flex min-w-0 items-center gap-2 text-sm"><MapPin size={15} className="shrink-0 text-ink-faint" aria-hidden /><span className="truncate">{value.label}</span></p>
          <button type="button" onClick={() => onChange(null)} aria-label={`Clear ${title}`} className="grid size-10 shrink-0 place-items-center text-ink-faint"><X size={16} aria-hidden /></button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {allowCurrent && (
              <button type="button" onClick={() => void locateMe()} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-medium ring-1 ring-inset ring-line">
                {geo.status === 'locating' ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Crosshair size={15} aria-hidden />} Use my location
              </button>
            )}
            {saved.map((p) => (
              <button key={p.id} type="button" onClick={() => onChange({ lat: p.latitude, lng: p.longitude, label: p.label })} className="min-h-11 rounded-full bg-white px-4 text-sm font-medium ring-1 ring-inset ring-line">{p.label}</button>
            ))}
          </div>
          <PlaceSearch label={`Search for ${title.toLowerCase()}`} onSelect={(p) => onChange({ lat: p.lat, lng: p.lng, label: p.label.split(',').slice(0, 2).join(',') })} />
          {geo.status === 'denied' && <p role="alert" className="text-sm text-red-800">Location permission is blocked. Allow it in your browser settings, or search for a place.</p>}
          {geo.status === 'unavailable' && <p role="alert" className="text-sm text-red-800">Your location could not be found. Search for a place instead.</p>}
          {hint && <p className="text-xs text-ink-faint">{hint}</p>}
        </>
      )}
    </fieldset>
  )
}
