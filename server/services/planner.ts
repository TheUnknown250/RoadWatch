import type { Db } from '../db/pool'
import { levelFor, riskPoints, type ScanLevel } from './safetyScan'
import type { LngLat, Providers, RawRoute } from './providers'

export interface RoutePrefs {
  avoidTolls: boolean
  avoidMotorways: boolean
  avoidFerries: boolean
  /** Weigh danger heavily against time when ranking routes. */
  preferSafest: boolean
}

export const DEFAULT_PREFS: RoutePrefs = { avoidTolls: false, avoidMotorways: false, avoidFerries: false, preferSafest: true }

export interface RouteIncident {
  id: number
  title: string
  category: string
  slug: string
  status: string
  latitude: number
  longitude: number
  distanceM: number
  risk: number
}

export type RouteTag = 'fastest' | 'safest' | 'recommended'

export interface PlannedRoute {
  id: string
  distanceM: number
  durationS: number
  /** Simplified path as [longitude, latitude]. */
  coordinates: LngLat[]
  risk: number
  safetyScore: number
  level: ScanLevel
  incidents: RouteIncident[]
  /** Travel time plus a time-equivalent penalty for danger on the way. This is what ranking uses. */
  effectiveMinutes: number
  tags: RouteTag[]
}

export interface RoutePlan {
  routes: PlannedRoute[]
  recommendedId: string
  appliedPreferences: string[]
  /** Preferences the current routing service cannot honour, reported so the UI never pretends. */
  ignoredPreferences: string[]
  provider: string
  trafficAware: false
}

/** Open incidents within this distance of the path count against a route. */
export const CORRIDOR_M = 300
/** Minutes of travel a route "costs" per risk point when safety is preferred vs. not. */
const PENALTY_SAFEST = 6
const PENALTY_NORMAL = 1.5
const ROUTE_SCORE_SCALE = 6

interface IncidentRow {
  id: string
  title: string
  status: string
  slug: string
  name: string
  severity: number
  age_days: number
  distance_m: number
  lat: number
  lng: number
}

async function analyse(db: Db, raw: RawRoute): Promise<{ coordinates: LngLat[]; risk: number; incidents: RouteIncident[] }> {
  const line = JSON.stringify({ type: 'LineString', coordinates: raw.coordinates })
  // ~30 m tolerance keeps the geometry small without moving it meaningfully relative to a 300 m corridor.
  const simp = await db.query<{ g: string }>(
    `SELECT ST_AsGeoJSON(ST_Simplify(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326), 0.0003), 5) AS g`,
    [line],
  )
  const geo = JSON.parse(simp.rows[0].g) as { coordinates: LngLat[] }
  const { rows } = await db.query<IncidentRow>(
    `WITH line AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography AS g)
     SELECT i.id, i.title, i.status, c.slug, c.name, c.severity_default AS severity,
            extract(epoch FROM (now() - i.occurred_at)) / 86400 AS age_days,
            ST_Distance(i.location, line.g) AS distance_m,
            ST_Y(i.location::geometry) AS lat, ST_X(i.location::geometry) AS lng
       FROM incidents i JOIN categories c ON c.id = i.category_id, line
      WHERE i.status IN ('pending', 'verified', 'disputed') AND i.expires_at > now()
        AND ST_DWithin(i.location, line.g, $2)`,
    [JSON.stringify({ type: 'LineString', coordinates: geo.coordinates }), CORRIDOR_M],
  )
  const incidents = rows
    .map((r) => ({
      id: Number(r.id), title: r.title, category: r.name, slug: r.slug, status: r.status, latitude: r.lat, longitude: r.lng,
      distanceM: Math.round(r.distance_m),
      risk: riskPoints({ status: r.status, severity: r.severity, ageDays: Number(r.age_days), distanceM: Number(r.distance_m) }, CORRIDOR_M),
    }))
    .sort((a, b) => b.risk - a.risk)
  return { coordinates: geo.coordinates, risk: incidents.reduce((s, i) => s + i.risk, 0), incidents: incidents.slice(0, 20) }
}

export function excludeFor(prefs: RoutePrefs): { exclude: string[]; wanted: string[] } {
  const wanted: string[] = []
  const exclude: string[] = []
  if (prefs.avoidTolls) { wanted.push('Avoid tolls'); exclude.push('toll') }
  if (prefs.avoidMotorways) { wanted.push('Avoid motorways'); exclude.push('motorway') }
  if (prefs.avoidFerries) { wanted.push('Avoid ferries'); exclude.push('ferry') }
  return { exclude, wanted }
}

/** Ranks candidate routes. Pure, so the trade-off between speed and safety is unit-testable. */
export function rankRoutes(
  candidates: Omit<PlannedRoute, 'effectiveMinutes' | 'tags' | 'id' | 'safetyScore' | 'level'>[],
  preferSafest: boolean,
): { routes: PlannedRoute[]; recommendedId: string } {
  const penalty = preferSafest ? PENALTY_SAFEST : PENALTY_NORMAL
  const routes: PlannedRoute[] = candidates.map((c, idx) => {
    const safetyScore = Math.round(100 * Math.exp(-c.risk / ROUTE_SCORE_SCALE))
    return {
      ...c,
      id: `route-${idx}`,
      safetyScore,
      level: levelFor(safetyScore),
      effectiveMinutes: Math.round((c.durationS / 60 + c.risk * penalty) * 10) / 10,
      tags: [],
    }
  })
  const by = (f: (r: PlannedRoute) => number) => routes.reduce((a, b) => (f(b) < f(a) ? b : a))
  const fastest = by((r) => r.durationS)
  const safest = by((r) => r.risk * 1e6 + r.durationS)
  const best = by((r) => r.effectiveMinutes)
  fastest.tags.push('fastest')
  safest.tags.push('safest')
  best.tags.push('recommended')
  routes.sort((a, b) => a.effectiveMinutes - b.effectiveMinutes)
  return { routes, recommendedId: best.id }
}

export async function planRoutes(
  db: Db,
  providers: Providers,
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  prefs: RoutePrefs,
): Promise<RoutePlan> {
  const { exclude, wanted } = excludeFor(prefs)
  const supported = providers.routing.supportsExclude
  const raws = await providers.routing.route({ from, to, exclude: supported ? exclude : [] })

  // Drop duplicate alternatives and keep at most three.
  const seen = new Set<string>()
  const unique = raws.filter((r) => {
    const k = `${Math.round(r.distanceM / 50)}:${Math.round(r.durationS / 20)}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  }).slice(0, 3)

  const analysed = await Promise.all(unique.map((r) => analyse(db, r)))
  const { routes, recommendedId } = rankRoutes(
    unique.map((r, i) => ({ distanceM: Math.round(r.distanceM), durationS: Math.round(r.durationS), ...analysed[i] })),
    prefs.preferSafest,
  )
  return {
    routes,
    recommendedId,
    appliedPreferences: supported ? wanted : [],
    ignoredPreferences: supported ? [] : wanted,
    provider: providers.routing.name,
    trafficAware: false,
  }
}
