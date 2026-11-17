import { useQuery } from '@tanstack/react-query'
import { Flame, List, Map as MapIcon, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AdvisoryBanner } from '@/components/AdvisoryBanner'
import { FilterBar } from '@/components/FilterBar'
import { IncidentCard } from '@/components/IncidentCard'
import { IncidentMap } from '@/components/IncidentMap'
import { StaleNotice } from '@/components/StaleNotice'
import { useIncidents } from '@/hooks/useIncidents'
import { api } from '@/lib/api'
import { timeAgo } from '@/lib/format'
import { EMPTY_FILTERS, type Hotspot, type IncidentFilters } from '@/lib/types'

type View = 'map' | 'list'

export default function MapPage() {
  const [filters, setFilters] = useState<IncidentFilters>(EMPTY_FILTERS)
  const [applied, setApplied] = useState(filters)
  const [view, setView] = useState<View>('map')
  const [showHotspots, setShowHotspots] = useState(false)
  const { data: hot } = useQuery({
    queryKey: ['hotspots', 30],
    enabled: showHotspots && view === 'map',
    queryFn: () => api<{ hotspots: Hotspot[] }>('/insights/hotspots?days=30', { auth: false }),
  })

  // Wait for a pause in typing before querying the server.
  useEffect(() => {
    const t = setTimeout(() => setApplied(filters), 300)
    return () => clearTimeout(t)
  }, [filters])

  const { data, isPending, isError, isFetching, refetch } = useIncidents(applied, 60_000)
  const incidents = data?.incidents ?? []

  return (
    <div className="space-y-3 p-4">
      <AdvisoryBanner />
      <FilterBar value={filters} onChange={setFilters} />

      {data?.stale && <StaleNotice fetchedAt={data.fetchedAt} />}

      <div className="flex items-center justify-between gap-3">
        <div role="group" aria-label="Display" className="inline-flex rounded-full bg-white p-1 ring-1 ring-inset ring-line">
          {([['map', MapIcon, 'Map'], ['list', List, 'List']] as const).map(([v, Icon, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium ${view === v ? 'bg-ink text-white' : 'text-ink-soft'}`}
            >
              <Icon size={15} aria-hidden /> {label}
            </button>
          ))}
        </div>
        {view === 'map' && (
          <button type="button" aria-pressed={showHotspots} onClick={() => setShowHotspots((v) => !v)} className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium ring-1 ring-inset ${showHotspots ? 'bg-sev-high text-white ring-sev-high' : 'bg-white text-ink-soft ring-line'}`}>
            <Flame size={15} aria-hidden /> Hotspots
          </button>
        )}
        <button type="button" onClick={() => void refetch()} className="inline-flex min-h-11 items-center gap-1.5 text-xs tabular-nums text-ink-faint" aria-label="Refresh incidents">
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} aria-hidden />
          {data && !data.stale ? `Updated ${timeAgo(data.fetchedAt)}` : isFetching ? 'Updating' : 'Refresh'}
        </button>
      </div>

      {isError && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Could not load incidents and nothing is saved on this device yet. Check your connection and try again.
        </p>
      )}

      {view === 'map' ? (
        <div className="overflow-hidden rounded-2xl border border-line">
          <IncidentMap incidents={incidents} hotspots={showHotspots ? hot?.hotspots : undefined} className="h-[52dvh] min-h-72 w-full" />
        </div>
      ) : (
        <ul className="space-y-3">
          {incidents.map((i) => (
            <li key={i.id}>
              <IncidentCard incident={i} />
            </li>
          ))}
        </ul>
      )}

      {!isPending && !isError && incidents.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line p-6 text-center">
          <p className="font-display text-base font-semibold">No incidents match</p>
          <p className="mt-1 text-sm text-ink-soft">Nothing has been reported with these filters. If you have seen something on the road, tell others.</p>
          <Link to="/report" className="mt-3 inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-sm font-semibold text-white">
            Report an incident
          </Link>
        </div>
      )}
      {view === 'map' && incidents.length > 0 && (
        <p className="text-xs tabular-nums text-ink-faint">{incidents.length} incident{incidents.length > 1 ? 's' : ''} shown. Switch to List for a screen-reader friendly view.</p>
      )}
    </div>
  )
}
