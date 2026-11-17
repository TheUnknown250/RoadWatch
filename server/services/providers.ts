import type { Config } from '../config'
import { HttpError } from '../errors'

export type LngLat = [number, number]

export interface RawRoute {
  distanceM: number
  durationS: number
  /** Path as [longitude, latitude] pairs. */
  coordinates: LngLat[]
}

export interface RouteRequest {
  from: { lat: number; lng: number }
  to: { lat: number; lng: number }
  /** OSRM road classes to avoid: toll, motorway, ferry. Only honoured if the provider supports it. */
  exclude: string[]
}

export interface RoutingProvider {
  readonly name: string
  /** Whether `exclude` is honoured. Callers report ignored preferences to the user instead of pretending. */
  readonly supportsExclude: boolean
  route(req: RouteRequest): Promise<RawRoute[]>
}

export interface PlaceResult {
  label: string
  lat: number
  lng: number
  type: string
  phone?: string
}

export type ServiceKind = 'hospital' | 'police' | 'fire'

export interface PlacesProvider {
  search(query: string): Promise<PlaceResult[]>
  nearby(kind: ServiceKind, lat: number, lng: number, radiusKm: number): Promise<PlaceResult[]>
}

export interface Providers {
  routing: RoutingProvider
  places: PlacesProvider
  now: () => Date
}

async function getJson(url: string, userAgent: string, timeoutMs: number): Promise<unknown> {
  const res = await fetch(url, { headers: { 'user-agent': userAgent, accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`upstream ${res.status}`)
  return res.json()
}

interface OsrmResponse {
  code: string
  routes?: { distance: number; duration: number; geometry: { coordinates: LngLat[] } }[]
}

export class OsrmProvider implements RoutingProvider {
  readonly name = 'osrm'
  constructor(
    private baseUrl: string,
    readonly supportsExclude: boolean,
    private userAgent: string,
  ) {}

  async route({ from, to, exclude }: RouteRequest): Promise<RawRoute[]> {
    const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`
    const params = new URLSearchParams({ alternatives: 'true', overview: 'full', geometries: 'geojson', steps: 'false' })
    if (this.supportsExclude && exclude.length) params.set('exclude', exclude.join(','))
    let body: OsrmResponse
    try {
      body = (await getJson(`${this.baseUrl}/route/v1/driving/${coords}?${params}`, this.userAgent, 12_000)) as OsrmResponse
    } catch {
      throw new HttpError(502, 'routing_unavailable', 'The routing service is not reachable right now. Please try again shortly.')
    }
    if (body.code === 'NoRoute' || !body.routes?.length) {
      throw new HttpError(404, 'no_route', 'No drivable route was found between those two places.')
    }
    return body.routes.map((r) => ({ distanceM: r.distance, durationS: r.duration, coordinates: r.geometry.coordinates }))
  }
}

interface NominatimItem {
  display_name: string
  name?: string
  lat: string
  lon: string
  type: string
  extratags?: Record<string, string>
}

/** Nominatim client that follows the public usage policy: identifying User-Agent, at most one request per second, cached. */
export class NominatimProvider implements PlacesProvider {
  private cache = new Map<string, { at: number; value: PlaceResult[] }>()
  private chain: Promise<unknown> = Promise.resolve()

  constructor(
    private baseUrl: string,
    private userAgent: string,
    private minGapMs = 1100,
  ) {}

  private throttled<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn)
    this.chain = run.then(() => new Promise((r) => setTimeout(r, this.minGapMs)), () => new Promise((r) => setTimeout(r, this.minGapMs)))
    return run
  }

  private async cached(key: string, ttlMs: number, load: () => Promise<PlaceResult[]>): Promise<PlaceResult[]> {
    const hit = this.cache.get(key)
    if (hit && Date.now() - hit.at < ttlMs) return hit.value
    let value: PlaceResult[]
    try {
      value = await this.throttled(load)
    } catch {
      throw new HttpError(502, 'places_unavailable', 'The place search service is not reachable right now.')
    }
    if (this.cache.size > 500) this.cache.clear()
    this.cache.set(key, { at: Date.now(), value })
    return value
  }

  private toResult(i: NominatimItem): PlaceResult {
    const phone = i.extratags?.phone ?? i.extratags?.['contact:phone']
    return { label: i.display_name, lat: Number(i.lat), lng: Number(i.lon), type: i.type, ...(phone ? { phone } : {}) }
  }

  search(query: string): Promise<PlaceResult[]> {
    const q = query.trim().toLowerCase()
    return this.cached(`s:${q}`, 10 * 60_000, async () => {
      const p = new URLSearchParams({ q, countrycodes: 'ng', format: 'jsonv2', limit: '6', addressdetails: '0' })
      return ((await getJson(`${this.baseUrl}/search?${p}`, this.userAgent, 10_000)) as NominatimItem[]).map((i) => this.toResult(i))
    })
  }

  nearby(kind: ServiceKind, lat: number, lng: number, radiusKm: number): Promise<PlaceResult[]> {
    const term = { hospital: 'hospital', police: 'police station', fire: 'fire station' }[kind]
    const dLat = radiusKm / 111
    const dLng = radiusKm / (111 * Math.cos((lat * Math.PI) / 180))
    // Round the box so nearby users share cache entries.
    const key = `n:${kind}:${lat.toFixed(2)}:${lng.toFixed(2)}:${radiusKm}`
    return this.cached(key, 60 * 60_000, async () => {
      const p = new URLSearchParams({
        q: term, countrycodes: 'ng', format: 'jsonv2', limit: '8', bounded: '1', extratags: '1',
        viewbox: `${lng - dLng},${lat + dLat},${lng + dLng},${lat - dLat}`,
      })
      return ((await getJson(`${this.baseUrl}/search?${p}`, this.userAgent, 10_000)) as NominatimItem[]).map((i) => this.toResult({ ...i, display_name: i.name || i.display_name }))
    })
  }
}

export function createProviders(config: Config): Providers {
  return {
    routing: new OsrmProvider(config.OSRM_URL, config.OSRM_SUPPORTS_EXCLUDE, config.GEO_USER_AGENT),
    places: new NominatimProvider(config.NOMINATIM_URL, config.GEO_USER_AGENT),
    now: () => new Date(),
  }
}
