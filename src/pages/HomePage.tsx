import { useQuery } from '@tanstack/react-query'
import { ArrowRight, BarChart3, Eye, Loader2, Map as MapIcon, PhoneCall, Route as RouteIcon, ScanSearch, ShieldAlert, ShieldCheck, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { AdvisoryBanner } from '@/components/AdvisoryBanner'
import { HeroCarousel } from '@/components/HeroCarousel'
import { IncidentCard } from '@/components/IncidentCard'
import { ScoreRing } from '@/components/ScoreRing'
import { TripSuggestions } from '@/components/TripSuggestions'
import { useGeolocation } from '@/hooks/useGeolocation'
import { useIncidents } from '@/hooks/useIncidents'
import { useInsights } from '@/hooks/useInsights'
import { api } from '@/lib/api'
import { LEVEL_STYLE } from '@/lib/format'
import { insideNigeria } from '@/lib/nigeria'
import { EMPTY_FILTERS, type SafetyScan } from '@/lib/types'

const TILES = [
  { to: '/report', icon: Eye, title: 'EyeReport', sub: 'Report an incident, anonymously if you prefer' },
  { to: '/map', icon: MapIcon, title: 'Live map', sub: 'See alerts and hotspots' },
  { to: '/routes', icon: RouteIcon, title: 'Safe routes', sub: 'Compare routes by time and danger' },
  { to: '/scan', icon: ScanSearch, title: 'Safety Scan', sub: 'Score any area before you go' },
  { to: '/safety', icon: ShieldAlert, title: 'SOS and monitor', sub: 'Alert and share your trip' },
  { to: '/communities', icon: Users, title: 'Communities', sub: 'Private safety circles' },
  { to: '/directory', icon: PhoneCall, title: 'Emergency numbers', sub: 'Police, fire, hospitals' },
  { to: '/insights', icon: BarChart3, title: 'Insights', sub: 'Trends across Nigeria' },
] as const

export default function HomePage() {
  const { me } = useAuth()
  const geo = useGeolocation(true)
  const here = geo.coords && insideNigeria(geo.coords.lat, geo.coords.lng) ? geo.coords : null

  const { data: scan } = useQuery({
    queryKey: ['home-scan', here && Math.round(here.lat * 100), here && Math.round(here.lng * 100)],
    enabled: Boolean(here),
    staleTime: 5 * 60_000,
    queryFn: () => api<SafetyScan>(`/insights/scan?lat=${here!.lat}&lng=${here!.lng}&radiusKm=10&days=30`, { auth: false }),
  })
  const { data: list } = useIncidents(here ? { ...EMPTY_FILTERS, near: { lat: here.lat, lng: here.lng, radiusKm: 25 } } : EMPTY_FILTERS, 60_000)
  const { data: week } = useInsights(7)
  const latest = (list?.incidents ?? []).slice(0, 3)
  const staff = me?.role === 'admin' || me?.role === 'moderator'

  return (
    <div className="space-y-5 p-4">
      <HeroCarousel />

      <section className="rounded-3xl border border-line bg-white/80 p-4" aria-label="Safety Scan around you">
        {scan ? (
          <div className="flex items-center gap-4">
            <ScoreRing score={scan.score} level={scan.level} size={104} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-soft">Safety around you</p>
              <p className="mt-0.5 flex items-center gap-2 font-display text-xl font-bold leading-tight">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: LEVEL_STYLE[scan.level].color }} aria-hidden />
                {LEVEL_STYLE[scan.level].label}
              </p>
              <p className="mt-1 text-pretty text-sm tabular-nums text-ink-soft">
                {scan.total === 0 ? 'No reports' : `${scan.total} report${scan.total === 1 ? '' : 's'}`} within {scan.radiusKm} km in the last {scan.days} days
                {scan.confidence === 'none' && '. Too little data to call this area safe.'}
              </p>
              <Link to="/scan" className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-white px-4 text-sm font-semibold text-ink transition-colors hover:bg-canvas">
                Full Safety Scan <ArrowRight size={15} aria-hidden />
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <button type="button" onClick={() => void geo.request()} disabled={geo.status === 'locating'} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-ink text-base font-semibold text-white disabled:opacity-70">
              {geo.status === 'locating' ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <ShieldCheck size={18} aria-hidden />} Check safety around me
            </button>
            {geo.status === 'denied' && <p role="alert" className="text-sm text-ink-soft">Location is blocked. Use <Link to="/scan" className="font-semibold text-focus underline">Safety Scan</Link> to pick a place instead.</p>}
            {geo.status === 'unavailable' && <p role="alert" className="text-sm text-ink-soft">We could not find your location. Use <Link to="/scan" className="font-semibold text-focus underline">Safety Scan</Link> to pick a place instead.</p>}
            {geo.coords && !here && <p className="text-sm text-ink-soft">Your location is outside Nigeria, where RoadWatch has coverage.</p>}
          </div>
        )}
      </section>

      <AdvisoryBanner />
      <TripSuggestions coords={here} />

      <section aria-labelledby="tiles-h">
        <h2 id="tiles-h" className="sr-only">Features</h2>
        <ul className="grid grid-cols-2 gap-3">
          {TILES.map(({ to, icon: Icon, title, sub }) => (
            <li key={to}>
              <Link to={to} className="flex h-full min-h-28 flex-col justify-between rounded-2xl border border-line bg-white/80 p-4 transition-colors hover:bg-white">
                <Icon size={22} className="text-ink" aria-hidden />
                <span><span className="block font-display text-base font-semibold">{title}</span><span className="block text-pretty text-xs text-ink-soft">{sub}</span></span>
              </Link>
            </li>
          ))}
          {staff && (
            <li><Link to="/admin" className="flex h-full min-h-28 flex-col justify-between rounded-2xl border border-line bg-white/80 p-4"><ShieldCheck size={22} aria-hidden /><span><span className="block font-display text-base font-semibold">Review</span><span className="block text-xs text-ink-soft">Moderation dashboard</span></span></Link></li>
          )}
        </ul>
      </section>

      <section aria-labelledby="near-h" className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 id="near-h" className="font-display text-base font-semibold">{here ? 'Near you' : 'Latest reports'}</h2>
          <Link to="/map" className="inline-flex min-h-11 items-center text-sm font-semibold text-focus">View map</Link>
        </div>
        {latest.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line p-5 text-center text-sm text-ink-soft">No open incidents{here ? ' near you' : ''} right now. If you see something on the road, report it so others know.</p>
        ) : (
          <ul className="space-y-3">{latest.map((i) => <li key={i.id}><IncidentCard incident={i} /></li>)}</ul>
        )}
      </section>

      {week && week.total > 0 && (
        <p className="text-center text-sm tabular-nums text-ink-soft">{week.total} report{week.total === 1 ? '' : 's'} this week, {week.verified} verified by the community.</p>
      )}
      <p className="text-center text-sm text-ink-soft"><Link to="/help" className="font-semibold text-focus underline">Help and safety tips</Link> · <Link to="/privacy" className="font-semibold text-focus underline">Privacy and terms</Link></p>
    </div>
  )
}
