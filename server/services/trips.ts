import type { Db } from '../db/pool'
import { planRoutes } from './planner'
import type { Providers } from './providers'
import { getSettings } from './settings'

// Nigeria observes West Africa Time (UTC+1) all year, with no daylight saving.
const WAT_OFFSET_MS = 3_600_000

export function watParts(d: Date): { dow: number; minutes: number; weekend: boolean } {
  const w = new Date(d.getTime() + WAT_OFFSET_MS)
  const dow = w.getUTCDay()
  return { dow, minutes: w.getUTCHours() * 60 + w.getUTCMinutes(), weekend: dow === 0 || dow === 6 }
}

/** The instant of HH:MM (West Africa Time) on the same WAT calendar day as `now`. */
export function watTimeToday(now: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  const w = new Date(now.getTime() + WAT_OFFSET_MS)
  w.setUTCHours(h, m, 0, 0)
  return new Date(w.getTime() - WAT_OFFSET_MS)
}

export interface PlaceRow {
  id: number
  label: string
  kind: string
  lat: number
  lng: number
  typicalDays: number[]
  arriveBy: string | null
}

export interface HabitRow {
  lat: number
  lng: number
  label: string | null
  count: number
  avgMinutes: number
  weekend: boolean
}

export interface Candidate {
  id: string
  kind: 'scheduled' | 'habit'
  label: string
  lat: number
  lng: number
  arriveBy?: Date
  leaveAt?: Date
  reason: string
}

const MIN = 60_000

/** Saved places with a typical arrival time that is coming up today. */
export function scheduledCandidates(places: PlaceRow[], now: Date): Candidate[] {
  const { dow } = watParts(now)
  const out: Candidate[] = []
  for (const p of places) {
    if (!p.arriveBy) continue
    if (p.typicalDays.length && !p.typicalDays.includes(dow)) continue
    const arriveBy = watTimeToday(now, p.arriveBy.slice(0, 5))
    const until = arriveBy.getTime() - now.getTime()
    if (until > 3 * 60 * MIN || until < -15 * MIN) continue
    out.push({ id: `place-${p.id}`, kind: 'scheduled', label: p.label, lat: p.lat, lng: p.lng, arriveBy, reason: `You usually arrive at ${p.label} by ${p.arriveBy.slice(0, 5)}.` })
  }
  return out
}

/** Destinations you reach at about this time on similar days (weekday or weekend), seen at least three times. */
export function habitCandidates(habits: HabitRow[], now: Date): Candidate[] {
  const { weekend } = watParts(now)
  const out: Candidate[] = []
  habits.forEach((h, i) => {
    if (h.weekend !== weekend) return
    const hh = String(Math.floor(h.avgMinutes / 60)).padStart(2, '0')
    const mm = String(h.avgMinutes % 60).padStart(2, '0')
    const leaveAt = watTimeToday(now, `${hh}:${mm}`)
    const until = leaveAt.getTime() - now.getTime()
    if (until > 90 * MIN || until < -20 * MIN) return
    const label = h.label ?? 'a place you visit often'
    out.push({ id: `habit-${i}`, kind: 'habit', label, lat: h.lat, lng: h.lng, leaveAt, reason: `You have gone to ${label} ${h.count} times around ${hh}:${mm} on ${weekend ? 'weekends' : 'weekdays'}.` })
  })
  return out
}

export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

/** Scheduled suggestions win over habits for the same place; results are ordered by when you should leave. */
export function mergeCandidates(scheduled: Candidate[], habits: Candidate[], origin: { lat: number; lng: number }): Candidate[] {
  const kept: Candidate[] = []
  for (const c of [...scheduled, ...habits]) {
    if (distanceM(origin, c) < 200) continue // already there
    if (kept.some((k) => distanceM(k, c) < 300)) continue
    kept.push(c)
  }
  const when = (c: Candidate) => (c.leaveAt ?? c.arriveBy ?? new Date(0)).getTime()
  return kept.sort((a, b) => when(a) - when(b)).slice(0, 3)
}

export const BUFFER_MIN = 10

/** When to leave: travel time plus a buffer before an arrival target, or the habitual time. */
export function departure(c: Candidate, durationS: number, now: Date): { leaveAt: Date; leaveNow: boolean } {
  const target = c.arriveBy ? new Date(c.arriveBy.getTime() - durationS * 1000 - BUFFER_MIN * MIN) : (c.leaveAt as Date)
  const leaveNow = target.getTime() <= now.getTime()
  return { leaveAt: leaveNow ? now : target, leaveNow }
}

export async function loadPlaces(db: Db, userId: number): Promise<PlaceRow[]> {
  const { rows } = await db.query(
    `SELECT id, label, kind, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng, typical_days, arrive_by::text AS arrive_by
       FROM saved_places WHERE user_id = $1 ORDER BY id`,
    [userId],
  )
  return rows.map((r) => ({ id: Number(r.id), label: r.label, kind: r.kind, lat: r.lat, lng: r.lng, typicalDays: r.typical_days, arriveBy: r.arrive_by }))
}

export async function loadHabits(db: Db, userId: number): Promise<HabitRow[]> {
  const { rows } = await db.query(
    `WITH t AS (
       SELECT destination, destination_label, started_at,
              extract(hour FROM started_at AT TIME ZONE 'Africa/Lagos') * 60 + extract(minute FROM started_at AT TIME ZONE 'Africa/Lagos') AS minutes,
              extract(isodow FROM started_at AT TIME ZONE 'Africa/Lagos') >= 6 AS weekend
         FROM trip_history WHERE user_id = $1 AND started_at > now() - interval '60 days')
     SELECT ST_Y(ST_Centroid(ST_Collect(destination::geometry))) AS lat, ST_X(ST_Centroid(ST_Collect(destination::geometry))) AS lng,
            (array_agg(destination_label ORDER BY started_at DESC) FILTER (WHERE destination_label IS NOT NULL))[1] AS label,
            count(*)::int AS n, round(avg(minutes))::int AS avg_minutes, weekend
       FROM t GROUP BY ST_SnapToGrid(destination::geometry, 0.003), weekend
     HAVING count(*) >= 3 AND stddev_pop(minutes) <= 90`,
    [userId],
  )
  return rows.map((r) => ({ lat: r.lat, lng: r.lng, label: r.label, count: r.n, avgMinutes: r.avg_minutes, weekend: r.weekend }))
}

export interface TripSuggestion {
  id: string
  kind: 'scheduled' | 'habit'
  label: string
  reason: string
  destination: { lat: number; lng: number }
  arriveBy: string | null
  leaveAt: string | null
  leaveNow: boolean
  etaMinutes: number | null
  distanceM: number | null
  safetyScore: number | null
  level: string | null
  warnings: string[]
  routeError: string | null
}

export async function tripSuggestions(db: Db, providers: Providers, userId: number, origin: { lat: number; lng: number }) {
  const settings = await getSettings(db, userId)
  if (!settings.tripSuggestions) return { enabled: false, suggestions: [] as TripSuggestion[] }

  const now = providers.now()
  const [places, habits] = await Promise.all([loadPlaces(db, userId), loadHabits(db, userId)])
  const candidates = mergeCandidates(scheduledCandidates(places, now), habitCandidates(habits, now), origin)

  const suggestions = await Promise.all(
    candidates.map(async (c): Promise<TripSuggestion> => {
      const base = { id: c.id, kind: c.kind, label: c.label, reason: c.reason, destination: { lat: c.lat, lng: c.lng }, arriveBy: c.arriveBy?.toISOString() ?? null }
      try {
        const plan = await planRoutes(db, providers, origin, c, settings)
        const best = plan.routes.find((r) => r.id === plan.recommendedId) ?? plan.routes[0]
        const dep = departure(c, best.durationS, now)
        return {
          ...base, leaveAt: dep.leaveAt.toISOString(), leaveNow: dep.leaveNow, etaMinutes: Math.round(best.durationS / 60),
          distanceM: best.distanceM, safetyScore: best.safetyScore, level: best.level,
          warnings: best.incidents.slice(0, 3).map((i) => `${i.category}: ${i.title}`), routeError: null,
        }
      } catch (err) {
        const dep = c.leaveAt ?? now
        return {
          ...base, leaveAt: dep.toISOString(), leaveNow: dep.getTime() <= now.getTime(), etaMinutes: null, distanceM: null,
          safetyScore: null, level: null, warnings: [], routeError: err instanceof Error ? err.message : 'Route unavailable',
        }
      }
    }),
  )
  return { enabled: true, suggestions }
}
