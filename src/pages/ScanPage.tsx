import { useMutation } from '@tanstack/react-query'
import { Loader2, ScanSearch } from 'lucide-react'
import { useState } from 'react'
import { IncidentMap } from '@/components/IncidentMap'
import { LocationField, type Spot } from '@/components/LocationField'
import { ScanResult } from '@/components/ScanResult'
import { api, errorMessage } from '@/lib/api'
import { insideNigeria } from '@/lib/nigeria'
import type { SafetyScan } from '@/lib/types'

export default function ScanPage() {
  const [spot, setSpot] = useState<Spot | null>(null)
  const [radiusKm, setRadiusKm] = useState(10)
  const [days, setDays] = useState(30)

  const scan = useMutation({
    mutationFn: (s: Spot) => api<SafetyScan>(`/insights/scan?lat=${s.lat}&lng=${s.lng}&radiusKm=${radiusKm}&days=${days}`, { auth: false }),
  })

  function pick(lat: number, lng: number) {
    if (!insideNigeria(lat, lng)) return
    setSpot({ lat, lng, label: `Pinned location (${lat.toFixed(4)}, ${lng.toFixed(4)})` })
  }

  return (
    <div className="space-y-4 p-4">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight">Safety Scan</h1>
        <p className="mt-1 text-pretty text-sm text-ink-soft">Check recent reports around any place before you travel, and get a colour-coded safety score with advice for the threats found.</p>
      </header>

      <section className="space-y-4 rounded-3xl border border-line bg-white/80 p-5">
        <LocationField title="Where are you going?" value={spot} onChange={(s) => { setSpot(s); scan.reset() }} hint="Or tap the map below to drop a pin." />
        <div className="overflow-hidden rounded-2xl border border-line">
          <IncidentMap incidents={[]} onPick={pick} pinned={spot ? [spot.lat, spot.lng] : null} fit={false} className="h-48 w-full" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-semibold">Radius
            <select value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} className="mt-1 h-12 w-full rounded-xl border border-line bg-white px-3 text-base font-normal">
              {[1, 5, 10, 25, 50].map((k) => <option key={k} value={k}>{k} km</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold">Time window
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="mt-1 h-12 w-full rounded-xl border border-line bg-white px-3 text-base font-normal">
              {[7, 30, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}
            </select>
          </label>
        </div>
        <button type="button" disabled={!spot || scan.isPending} onClick={() => spot && scan.mutate(spot)} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-ink text-base font-semibold text-white disabled:opacity-50">
          {scan.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <ScanSearch size={16} aria-hidden />} Scan this area
        </button>
      </section>

      {scan.isError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{errorMessage(scan.error)}</p>}
      {scan.data && <ScanResult scan={scan.data} />}
    </div>
  )
}
