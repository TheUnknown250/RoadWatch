import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Phone, TriangleAlert } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { IncidentMap, type MapSpot } from '@/components/IncidentMap'
import { api } from '@/lib/api'
import { formatClock, formatDateTime, timeAgo } from '@/lib/format'
import type { SafetySession } from '@/lib/types'

const STALE_AFTER_MS = 3 * 60_000

/** Live view of someone who shared an SOS or trip with a community you are in. */
export default function SessionPage() {
  const id = Number(useParams().id)
  const { data, isError } = useQuery({
    queryKey: ['safety', 'session', id],
    refetchInterval: 10_000,
    queryFn: () => api<{ session: SafetySession; serverTime: string }>(`/safety/${id}`),
  })

  if (isError) return <div className="space-y-3 p-6 text-center"><p className="text-ink-soft">This session is not available. It may have ended, or it was not shared with you.</p><Link to="/safety" className="font-semibold text-focus underline">Back to safety</Link></div>
  if (!data) return <p role="status" className="p-6 text-sm text-ink-soft">Loading</p>

  const s = data.session
  // Compare with the server clock so a wrong phone clock cannot hide a stale location.
  const stale = new Date(data.serverTime).getTime() - new Date(s.lastSeen).getTime() > STALE_AFTER_MS
  const alarming = s.status !== 'ended' && (s.kind === 'sos' || s.status === 'overdue')
  const spots: MapSpot[] = [
    ...(s.lastLocation ? [{ id: 'who', lat: s.lastLocation.lat, lng: s.lastLocation.lng, label: s.owner.displayName, tone: s.kind === 'sos' ? ('sos' as const) : ('person' as const) }] : []),
    ...(s.destination ? [{ id: 'dest', lat: s.destination.lat, lng: s.destination.lng, label: s.destination.label ?? 'Destination', tone: 'destination' as const }] : []),
  ]

  return (
    <div className="space-y-4 p-4">
      <Link to="/safety" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-ink-soft"><ArrowLeft size={16} aria-hidden /> Safety</Link>

      <header className={`rounded-3xl p-5 ${alarming ? 'border border-red-200 bg-red-50' : 'border border-line bg-white/80'}`}>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink-soft">{alarming && <TriangleAlert size={14} className="text-sev-high" aria-hidden />}{s.kind === 'sos' ? 'SOS alert' : 'Shared trip'}</p>
        <h1 className="font-display text-2xl font-bold tracking-tight">{s.owner.displayName}</h1>
        <p className="mt-1 text-sm text-ink-soft tabular-nums">
          {s.status === 'ended'
            ? `Ended ${s.endedAt ? timeAgo(s.endedAt) : ''}: ${s.outcome === 'arrived' ? 'arrived safely' : s.outcome === 'safe' ? 'marked themselves safe' : 'stopped sharing'}.`
            : s.kind === 'sos'
              ? `Started ${timeAgo(s.startedAt)}.`
              : `Heading to ${s.destination?.label ?? 'a destination'}, due ${s.expectedArrival ? formatClock(s.expectedArrival) : 'soon'}${s.status === 'overdue' ? ' (overdue)' : ''}.`}
        </p>
        {s.message && <p className="mt-2 text-pretty text-sm">“{s.message}”</p>}
      </header>

      {s.status !== 'ended' && (
        <>
          {s.lastLocation ? (
            <div className="overflow-hidden rounded-2xl border border-line"><IncidentMap incidents={[]} spots={spots} className="h-72 w-full" /></div>
          ) : (
            <p className="rounded-xl border border-dashed border-line p-4 text-sm text-ink-soft">No location has been shared yet.</p>
          )}
          <p role="status" className={`rounded-xl px-3 py-2 text-sm tabular-nums ${stale ? 'border border-amber-300 bg-amber-50 text-amber-900' : 'bg-white/80 text-ink-soft'}`}>
            {stale ? `Their location may be out of date. Last update ${timeAgo(s.lastSeen)} (${formatDateTime(s.lastSeen)}). Phones stop sharing when the app is closed.` : `Updated ${timeAgo(s.lastSeen)}. This page refreshes every 10 seconds.`}
          </p>
          <a href="tel:112" className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink font-semibold text-white"><Phone size={16} aria-hidden /> Call 112 if they need help</a>
          <p className="text-xs text-ink-faint">Try calling {s.owner.displayName} first. RoadWatch does not contact emergency services for you.</p>
        </>
      )}
    </div>
  )
}
