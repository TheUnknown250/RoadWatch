import { useMutation, useQuery } from '@tanstack/react-query'
import { Clock, ExternalLink, Loader2, Route as RouteIcon, Share2, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { IncidentMap, type MapRoute, type MapSpot } from '@/components/IncidentMap'
import { LocationField, type Spot } from '@/components/LocationField'
import { api, errorMessage } from '@/lib/api'
import { formatDuration, formatKm, LEVEL_STYLE } from '@/lib/format'
import type { PlannedRoute, RoutePlan, RouteTag, SavedPlace } from '@/lib/types'

const TAG_LABEL: Record<RouteTag, string> = { recommended: 'Recommended', fastest: 'Fastest', safest: 'Safest' }
const ROUTE_COLORS = ['#0F1B33', '#3B5B8C', '#7A8499']

export default function RoutesPage() {
  const { me, status } = useAuth()
  const [from, setFrom] = useState<Spot | null>(null)
  // Trip Suggestions link here with the destination already chosen.
  const prefill = (useLocation().state as { to?: Spot } | null)?.to ?? null
  const [to, setTo] = useState<Spot | null>(prefill)
  const [selected, setSelected] = useState<string | null>(null)

  const { data: places } = useQuery({
    queryKey: ['places'],
    enabled: Boolean(me),
    queryFn: () => api<{ places: SavedPlace[] }>('/me/places'),
  })

  const plan = useMutation({
    mutationFn: () => api<RoutePlan>('/routes', { body: { from: { lat: from!.lat, lng: from!.lng }, to: { lat: to!.lat, lng: to!.lng } } }),
    onSuccess: (p) => setSelected(p.recommendedId),
  })
  const data = plan.data
  const route = data?.routes.find((r) => r.id === selected) ?? data?.routes[0]

  const mapRoutes: MapRoute[] = useMemo(
    () => (data?.routes ?? []).map((r, i) => ({ id: r.id, coordinates: r.coordinates, color: ROUTE_COLORS[i % ROUTE_COLORS.length], selected: r.id === (selected ?? data?.recommendedId) })),
    [data, selected],
  )
  const spots: MapSpot[] = [
    ...(from ? [{ id: 'a', lat: from.lat, lng: from.lng, label: from.label, tone: 'origin' as const }] : []),
    ...(to ? [{ id: 'b', lat: to.lat, lng: to.lng, label: to.label, tone: 'destination' as const }] : []),
  ]

  if (status === 'loading') return null
  if (!me) {
    return (
      <div className="space-y-3 p-6 text-center">
        <h1 className="font-display text-xl font-bold">Safe route planner</h1>
        <p className="text-ink-soft">Sign in to compare routes ranked by time and safety.</p>
        <Link to="/signin" state={{ from: '/routes' }} className="inline-flex min-h-12 items-center rounded-full bg-ink px-6 font-semibold text-white">Sign in or register</Link>
      </div>
    )
  }

  const mapsUrl = from && to ? `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=driving` : '#'

  function recordTrip(r: PlannedRoute) {
    if (!from || !to) return
    void api('/trips', { body: { from: { lat: from.lat, lng: from.lng }, to: { lat: to.lat, lng: to.lng }, destinationLabel: to.label.slice(0, 120), distanceM: r.distanceM, durationS: r.durationS, safetyScore: r.safetyScore } }).catch(() => undefined)
  }

  return (
    <div className="space-y-4 p-4">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight">Safe route planner</h1>
        <p className="mt-1 text-pretty text-sm text-ink-soft">Compares the routes available and ranks them by travel time and by reported danger along the way.</p>
      </header>

      <section className="space-y-4 rounded-3xl border border-line bg-white/80 p-5">
        <LocationField title="From" value={from} onChange={(s) => { setFrom(s); plan.reset() }} />
        <LocationField title="To" value={to} onChange={(s) => { setTo(s); plan.reset() }} saved={places?.places} allowCurrent={false} />
        <button type="button" disabled={!from || !to || plan.isPending} onClick={() => plan.mutate()} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-ink text-base font-semibold text-white disabled:opacity-50">
          {plan.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <RouteIcon size={16} aria-hidden />} Find routes
        </button>
        <p className="text-xs text-ink-faint">Your route preferences are in <Link to="/settings" className="font-semibold text-focus underline">Settings</Link>.</p>
      </section>

      {plan.isError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{errorMessage(plan.error)}</p>}

      {data && route && (
        <>
          {data.ignoredPreferences.length > 0 && (
            <p role="note" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              The routing service in use cannot apply: {data.ignoredPreferences.join(', ').toLowerCase()}. Routes may include them.
            </p>
          )}

          <div className="overflow-hidden rounded-2xl border border-line">
            <IncidentMap incidents={[]} routes={mapRoutes} onSelectRoute={setSelected} spots={spots}
              hazards={route.incidents.map((i) => ({ id: i.id, lat: i.latitude, lng: i.longitude, title: `${i.category}: ${i.title}`, color: i.risk >= 2 ? '#B91C1C' : '#B7791F' }))}
              className="h-72 w-full" />
          </div>

          <ul className="space-y-3" role="radiogroup" aria-label="Route options">
            {data.routes.map((r, idx) => {
              const on = r.id === route.id
              const lvl = LEVEL_STYLE[r.level]
              return (
                <li key={r.id}>
                  <button type="button" role="radio" aria-checked={on} onClick={() => setSelected(r.id)} className={`w-full rounded-2xl border p-4 text-left transition-colors ${on ? 'border-ink bg-white ring-2 ring-ink' : 'border-line bg-white/70'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="flex flex-wrap gap-1.5">
                          <span className="size-3 translate-y-1 rounded-full" style={{ background: ROUTE_COLORS[idx % ROUTE_COLORS.length] }} aria-hidden />
                          {r.tags.map((t) => <span key={t} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${t === 'recommended' ? 'bg-ink text-white' : 'bg-canvas text-ink-soft'}`}>{TAG_LABEL[t]}</span>)}
                        </p>
                        <p className="mt-1 font-display text-2xl font-bold tabular-nums">{formatDuration(r.durationS)} <span className="text-base font-medium text-ink-soft">· {formatKm(r.distanceM)}</span></p>
                      </div>
                      <div className={`rounded-xl px-3 py-1.5 text-center ${lvl.panel}`}>
                        <p className="font-display text-xl font-bold leading-none tabular-nums">{r.safetyScore}</p>
                        <p className="text-[11px] font-semibold">{lvl.label}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-ink-soft tabular-nums">{r.incidents.length === 0 ? 'No open incidents reported along this route.' : `${r.incidents.length} open incident${r.incidents.length > 1 ? 's' : ''} within 300 m of this route.`}</p>
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="flex items-start gap-2 text-xs text-ink-faint"><Clock size={14} className="mt-0.5 shrink-0" aria-hidden /> Times are estimates without live traffic. Danger is based on open incidents reported by RoadWatch users.</p>

          {route.incidents.length > 0 && (
            <section aria-labelledby="along-h" className="rounded-2xl border border-line bg-white/80 p-4">
              <h2 id="along-h" className="flex items-center gap-2 font-display text-base font-semibold"><TriangleAlert size={16} aria-hidden /> On the selected route</h2>
              <ul className="mt-2 space-y-2">
                {route.incidents.slice(0, 6).map((i) => (
                  <li key={i.id}><Link to={`/incidents/${i.id}`} className="block rounded-xl bg-canvas px-3 py-2 text-sm"><span className="font-medium">{i.title}</span><span className="block text-xs text-ink-faint tabular-nums">{i.category} · {i.distanceM} m from the route</span></Link></li>
                ))}
              </ul>
            </section>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" onClick={() => recordTrip(route)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-white">
              <ExternalLink size={16} aria-hidden /> Start trip in Google Maps
            </a>
            <Link to="/safety" state={{ destination: to, etaSeconds: route.durationS }} onClick={() => recordTrip(route)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-semibold ring-1 ring-inset ring-line">
              <Share2 size={16} aria-hidden /> Share this trip with my circle
            </Link>
          </div>
          <p className="text-xs text-ink-faint">RoadWatch plans and ranks routes. Turn-by-turn voice navigation is handed to Google Maps. Starting a trip saves it to your history for Trip Suggestions; you can clear it in Settings.</p>
        </>
      )}
    </div>
  )
}
