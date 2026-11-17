import { useQuery } from '@tanstack/react-query'
import { Clock, Lightbulb, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { api } from '@/lib/api'
import { formatClock, formatKm, LEVEL_STYLE } from '@/lib/format'
import type { LatLng, TripSuggestion } from '@/lib/types'

interface Res {
  enabled: boolean
  suggestions: TripSuggestion[]
}

/** Proactive suggestions: where you may be heading, when to leave, and what to watch for on the way. */
export function TripSuggestions({ coords }: { coords: LatLng | null }) {
  const { me } = useAuth()
  const lat = coords ? Math.round(coords.lat * 1000) / 1000 : null
  const lng = coords ? Math.round(coords.lng * 1000) / 1000 : null
  const { data } = useQuery({
    queryKey: ['suggestions', lat, lng],
    enabled: Boolean(me && coords),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
    queryFn: () => api<Res>(`/trips/suggestions?lat=${lat}&lng=${lng}`),
  })

  if (!me) return null
  if (data && !data.enabled) {
    return <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-ink-soft">Trip Suggestions are off. <Link to="/settings" className="font-semibold text-focus underline">Turn them on in Settings</Link>.</p>
  }
  if (!data || data.suggestions.length === 0) {
    return coords ? (
      <p className="flex items-start gap-2 rounded-2xl border border-dashed border-line p-4 text-sm text-ink-soft"><Lightbulb size={16} className="mt-0.5 shrink-0" aria-hidden /> <span>Save your regular places and arrival times in <Link to="/settings" className="font-semibold text-focus underline">Settings</Link> and RoadWatch will tell you when to leave.</span></p>
    ) : null
  }

  return (
    <section aria-labelledby="sugg-h" className="space-y-3">
      <h2 id="sugg-h" className="font-display text-base font-semibold">Trip suggestions</h2>
      <ul className="space-y-3">
        {data.suggestions.map((s) => (
          <li key={s.id} className="rounded-2xl border border-line bg-white/80 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-display text-lg font-semibold">{s.label}</p>
                <p className="text-pretty text-xs text-ink-soft">{s.reason}</p>
              </div>
              {s.level && s.safetyScore !== null && <span className={`shrink-0 rounded-xl px-2.5 py-1 text-center text-xs font-semibold tabular-nums ${LEVEL_STYLE[s.level].panel}`}>{s.safetyScore}<br />{LEVEL_STYLE[s.level].label}</span>}
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-sm font-medium tabular-nums"><Clock size={14} aria-hidden /> {s.leaveNow ? 'Leave now' : `Leave at ${s.leaveAt ? formatClock(s.leaveAt) : 'soon'}`}{s.etaMinutes !== null && <span className="font-normal text-ink-soft"> · {s.etaMinutes} min{s.distanceM !== null && `, ${formatKm(s.distanceM)}`}</span>}</p>
            {s.warnings.length > 0 && (
              <ul className="mt-2 space-y-1">
                {s.warnings.map((w) => <li key={w} className="flex items-start gap-1.5 text-xs text-amber-900"><TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden /> {w}</li>)}
              </ul>
            )}
            {s.routeError && <p className="mt-2 text-xs text-ink-faint">Route details are unavailable right now.</p>}
            <Link to="/routes" state={{ to: { lat: s.destination.lat, lng: s.destination.lng, label: s.label } }} className="mt-3 inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-sm font-semibold text-white">See routes</Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
