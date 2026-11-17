import type { AddressInfo } from 'node:net'
import pg from 'pg'
import { createApp } from '../app'
import type { DecodedToken, TokenVerifier } from '../auth'
import { loadConfig } from '../config'
import { migrate } from '../db/migrate'
import { createPool, sslOption, type SslMode } from '../db/pool'
import type { IncidentEvent, PushPayload, Realtime } from '../services/context'
import type { RateLimits } from '../middleware/rateLimit'
import type { PlaceResult, PlacesProvider, Providers, RawRoute, RouteRequest, RoutingProvider, ServiceKind } from '../services/providers'
import { HttpError } from '../errors'
import { createTokenService, type GoogleVerifier } from '../services/localAuth'

function getAdminConfig() {
  const config = loadConfig()
  const adminUrl = process.env.TEST_ADMIN_DATABASE_URL ?? config.DATABASE_URL
  const ssl = (process.env.DATABASE_SSL as SslMode) ?? config.DATABASE_SSL
  return { adminUrl, ssl }
}

function testUrl(db: string) {
  const { adminUrl } = getAdminConfig()
  try {
    const u = new URL(adminUrl)
    u.pathname = `/${db}`
    return u.toString()
  } catch {
    return `postgres://roadwatch:roadwatch_dev@127.0.0.1:5433/${db}`
  }
}

async function ensureDatabase(name: string) {
  const { adminUrl, ssl } = getAdminConfig()
  const admin = new pg.Client({ connectionString: adminUrl, ssl: sslOption(ssl) })
  await admin.connect()
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])
  if (!exists.rowCount) await admin.query(`CREATE DATABASE ${name}`)
  await admin.end()
}

/** Token format `test:<uid>:<email>`; real session tokens are exercised in auth.test.ts via `realAuth`. */
const fakeVerifier: TokenVerifier = {
  async verify(token): Promise<DecodedToken> {
    const [prefix, uid, email] = token.split(':')
    if (prefix !== 'test' || !uid) throw new Error('bad token')
    return { uid, email, emailVerified: true, name: uid }
  },
}

export const tokenFor = (uid: string, email = `${uid}@example.test`) => `test:${uid}:${email}`

export class RecordingRealtime implements Realtime {
  events: IncidentEvent[] = []
  pushes: { userIds: number[]; payload: PushPayload }[] = []
  fail = false
  async incidentChanged(e: IncidentEvent) {
    if (this.fail) throw new Error('firestore down')
    this.events.push(e)
  }
  async push(userIds: number[], payload: PushPayload) {
    this.pushes.push({ userIds, payload })
  }
}

/** Each test file passes its own `name` so files never share a database. */
/** Deterministic routing: returns whatever `routes` holds and records every request. */
export class FakeRouting implements RoutingProvider {
  readonly name = 'fake'
  supportsExclude = false
  requests: RouteRequest[] = []
  routes: RawRoute[] = []
  error: HttpError | null = null
  async route(req: RouteRequest): Promise<RawRoute[]> {
    this.requests.push(req)
    if (this.error) throw this.error
    return this.routes.length ? this.routes : [straightRoute(req.from, req.to)]
  }
}

/** A straight line between two points, ~1.3x the crow-flies distance at 40 km/h. */
export function straightRoute(a: { lat: number; lng: number }, b: { lat: number; lng: number }, via?: { lat: number; lng: number }): RawRoute {
  const pts: [number, number][] = [[a.lng, a.lat], ...(via ? [[via.lng, via.lat] as [number, number]] : []), [b.lng, b.lat]]
  const km = Math.hypot((b.lat - a.lat) * 111, (b.lng - a.lng) * 111) * 1.3 * (via ? 1.15 : 1)
  return { distanceM: Math.round(km * 1000), durationS: Math.round((km / 40) * 3600), coordinates: pts }
}

export class FakePlaces implements PlacesProvider {
  searches: string[] = []
  fail: Partial<Record<ServiceKind, boolean>> = {}
  async search(q: string): Promise<PlaceResult[]> {
    this.searches.push(q)
    return [{ label: `${q}, Lagos`, lat: 6.6, lng: 3.35, type: 'city' }]
  }
  async nearby(kind: ServiceKind, lat: number, lng: number): Promise<PlaceResult[]> {
    if (this.fail[kind]) throw new HttpError(502, 'places_unavailable', 'down')
    const d = { hospital: 0.02, police: 0.01, fire: 0.03 }[kind]
    return [{ label: `${kind} #1`, lat: lat + d, lng, type: kind, ...(kind === 'hospital' ? { phone: '+234 1 000 0000' } : {}) }]
  }
}

export async function startTestApp(
  name: string,
  opts: { limits?: Partial<RateLimits>; now?: () => Date; realAuth?: boolean; google?: GoogleVerifier; env?: Record<string, string> } = {},
) {
  const { ssl } = getAdminConfig()
  const dbName = `roadwatch_test_${name}`
  await ensureDatabase(dbName)
  const TEST_URL = testUrl(dbName)
  const db = createPool(TEST_URL, ssl)
  await migrate(db)
  await db.query('TRUNCATE users, incidents, verifications, incident_status_history, notifications, device_tokens, area_subscriptions, communities RESTART IDENTITY CASCADE')
  const realtime = new RecordingRealtime()
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: TEST_URL, DATABASE_SSL: ssl, ADMIN_EMAILS: 'admin@example.test', ...opts.env })
  const tokens = createTokenService(config)
  const routing = new FakeRouting()
  const places = new FakePlaces()
  const providers: Providers = { routing, places, now: opts.now ?? (() => new Date()) }
  const app = createApp({ config, db, verifier: opts.realAuth ? tokens.verifier : fakeVerifier, tokens, google: opts.google, realtime, providers, limits: { global: 10_000, report: 1000, vote: 1000, ...opts.limits } })
  const server = app.listen(0)
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  async function api(path: string, init: { method?: string; as?: string; token?: string; body?: unknown; raw?: string } = {}) {
    const headers: Record<string, string> = {}
    if (init.token) headers.authorization = `Bearer ${init.token}`
    else if (init.as) headers.authorization = `Bearer ${tokenFor(init.as)}`
    if (init.body !== undefined || init.raw !== undefined) headers['content-type'] = 'application/json'
    const res = await fetch(base + path, {
      method: init.method ?? (init.body !== undefined || init.raw !== undefined ? 'POST' : 'GET'),
      headers,
      body: init.raw ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
    })
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : null }
  }

  return {
    api, db, realtime, base, routing, places, providers, config, tokens,
    async close() {
      server.close()
      await db.end()
    },
  }
}

let n = 0
export const reportBody = (over: Record<string, unknown> = {}) => ({
  categorySlug: 'accident',
  title: 'Overturned truck on the expressway',
  description: 'A truck has overturned and is blocking two lanes.',
  latitude: 6.5244,
  longitude: 3.3792,
  state: 'Lagos',
  occurredAt: new Date(Date.now() - 60_000).toISOString(),
  idempotencyKey: `key-${Date.now()}-${n++}`,
  ...over,
})
