import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { HttpError } from '../errors'
import { DEFAULT_PREFS, excludeFor, rankRoutes } from '../services/planner'
import { reportBody, startTestApp, straightRoute } from './helpers'

const t = await startTestApp('routing')
afterAll(() => t.close())

const A = { lat: 6.45, lng: 3.35 }
const B = { lat: 6.65, lng: 3.35 }
const VIA = { lat: 6.55, lng: 3.5 } // detour east of the direct line
const post = (as = 'rider', body: unknown = { from: A, to: B }) => t.api('/api/routes', { as, body })

beforeEach(async () => {
  await t.db.query('TRUNCATE users, incidents, verifications, incident_status_history, notifications RESTART IDENTITY CASCADE')
  t.routing.requests.length = 0
  t.routing.error = null
  t.routing.supportsExclude = false
  t.routing.routes = [straightRoute(A, B), straightRoute(A, B, VIA)]
})

/** A verified, serious incident sitting on the direct route. */
async function hazardOnDirectRoute() {
  const r = await t.api('/api/incidents', { as: 'reporter', body: reportBody({ categorySlug: 'armed-robbery', title: 'Armed men on the expressway', latitude: 6.55, longitude: 3.35 }) })
  await t.db.query("UPDATE incidents SET status = 'verified' WHERE id = $1", [r.body.incident.id])
}

describe('ranking', () => {
  const cand = (durationS: number, risk: number) => ({ distanceM: 1000, durationS, coordinates: [] as [number, number][], risk, incidents: [] })
  test('preferring safety trades minutes for lower risk; otherwise the faster road wins', () => {
    const c = [cand(1200, 2), cand(1500, 0)]
    expect(rankRoutes(c, true).routes[0].durationS).toBe(1500)
    expect(rankRoutes(c, false).routes[0].durationS).toBe(1200)
  })
  test('tags fastest, safest and recommended, and scores fall with risk', () => {
    const { routes, recommendedId } = rankRoutes([cand(1200, 4), cand(1500, 0)], true)
    const byId = Object.fromEntries(routes.map((r) => [r.durationS, r]))
    expect(byId[1200].tags).toEqual(['fastest'])
    expect(byId[1500].tags.sort()).toEqual(['recommended', 'safest'])
    expect(routes.find((r) => r.id === recommendedId)?.durationS).toBe(1500)
    expect(byId[1500].safetyScore).toBe(100)
    expect(byId[1200].safetyScore).toBeLessThan(60)
  })
  test('a single route carries every tag', () => {
    expect(rankRoutes([cand(900, 0)], true).routes[0].tags.sort()).toEqual(['fastest', 'recommended', 'safest'])
  })
  test('preferences map to routing exclusions', () => {
    expect(excludeFor({ ...DEFAULT_PREFS, avoidTolls: true, avoidFerries: true })).toEqual({ exclude: ['toll', 'ferry'], wanted: ['Avoid tolls', 'Avoid ferries'] })
  })
})

describe('POST /routes', () => {
  test('requires sign-in and validates coordinates', async () => {
    expect((await t.api('/api/routes', { body: { from: A, to: B } })).status).toBe(401)
    expect((await post('rider', { from: A, to: { lat: 51, lng: 0 } })).status).toBe(400)
    expect((await post('rider', { from: A })).status).toBe(400)
  })

  test('with no incidents the fastest route is recommended and everything is honest about traffic', async () => {
    const r = await post()
    expect(r.status).toBe(200)
    expect(r.body.trafficAware).toBe(false)
    expect(r.body.routes).toHaveLength(2)
    const rec = r.body.routes.find((x: { id: string }) => x.id === r.body.recommendedId)
    expect(rec.tags).toContain('fastest')
    expect(rec.safetyScore).toBe(100)
    expect(rec.coordinates.length).toBeGreaterThanOrEqual(2)
  })

  test('routes around a dangerous incident even though it is slower', async () => {
    await hazardOnDirectRoute()
    const r = (await post()).body
    const rec = r.routes.find((x: { id: string }) => x.id === r.recommendedId)
    const direct = r.routes.find((x: { incidents: unknown[] }) => x.incidents.length > 0)
    expect(direct).toBeDefined()
    expect(direct.incidents[0].title).toBe('Armed men on the expressway')
    expect(direct.tags).toContain('fastest')
    expect(rec.id).not.toBe(direct.id)
    expect(rec.tags).toEqual(expect.arrayContaining(['safest', 'recommended']))
    expect(rec.durationS).toBeGreaterThan(direct.durationS)
    expect(rec.safetyScore).toBeGreaterThan(direct.safetyScore)
  })

  test('turning off "prefer safest" makes a minor hazard no longer worth the detour', async () => {
    const r = await t.api('/api/incidents', { as: 'reporter', body: reportBody({ categorySlug: 'bad-road', title: 'Potholes', latitude: 6.55, longitude: 3.35 }) })
    expect(r.status).toBe(201)
    await t.api('/api/me/settings', { as: 'rider', method: 'PATCH', body: { preferSafest: false } })
    const out = (await post()).body
    expect(out.routes.find((x: { id: string }) => x.id === out.recommendedId).tags).toContain('fastest')
  })

  test('only open incidents near the path count', async () => {
    await t.api('/api/incidents', { as: 'u1', body: reportBody({ title: 'Far away crash', latitude: 6.55, longitude: 3.9 }) })
    const w = await t.api('/api/incidents', { as: 'u2', body: reportBody({ title: 'Withdrawn one', latitude: 6.55, longitude: 3.35, categorySlug: 'kidnapping' }) })
    await t.api(`/api/incidents/${w.body.incident.id}/withdraw`, { as: 'u2', body: {} })
    const out = (await post()).body
    expect(out.routes.every((x: { incidents: unknown[] }) => x.incidents.length === 0)).toBe(true)
  })

  test('preferences the routing service cannot honour are reported, not faked', async () => {
    await t.api('/api/me/settings', { as: 'rider', method: 'PATCH', body: { avoidTolls: true, avoidMotorways: true } })
    let out = (await post()).body
    expect(out.ignoredPreferences).toEqual(['Avoid tolls', 'Avoid motorways'])
    expect(out.appliedPreferences).toEqual([])
    expect(t.routing.requests.at(-1)?.exclude).toEqual([])

    t.routing.supportsExclude = true
    out = (await post()).body
    expect(out.appliedPreferences).toEqual(['Avoid tolls', 'Avoid motorways'])
    expect(t.routing.requests.at(-1)?.exclude).toEqual(['toll', 'motorway'])
  })

  test('routing outages and unroutable pairs return clear errors', async () => {
    t.routing.error = new HttpError(502, 'routing_unavailable', 'down')
    expect((await post()).status).toBe(502)
    t.routing.error = new HttpError(404, 'no_route', 'none')
    const r = await post()
    expect(r.status).toBe(404)
    expect(r.body.error.code).toBe('no_route')
  })

  test('identical alternatives are collapsed', async () => {
    t.routing.routes = [straightRoute(A, B), straightRoute(A, B)]
    expect((await post()).body.routes).toHaveLength(1)
  })
})
