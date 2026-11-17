import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { reportBody, startTestApp } from './helpers'

const t = await startTestApp('incidents')
afterAll(() => t.close())
beforeEach(async () => {
  await t.db.query('TRUNCATE users, incidents, verifications, incident_status_history, notifications, area_subscriptions RESTART IDENTITY CASCADE')
  t.realtime.events.length = 0
})

describe('reporting', () => {
  test('requires authentication', async () => {
    const r = await t.api('/api/incidents', { body: reportBody() })
    expect(r.status).toBe(401)
  })

  test('creates an incident, writes history, and mirrors to realtime', async () => {
    const r = await t.api('/api/incidents', { as: 'alice', body: reportBody() })
    expect(r.status).toBe(201)
    expect(r.body.incident.status).toBe('pending')
    expect(r.body.incident.category.slug).toBe('accident')
    expect(r.body.incident.latitude).toBeCloseTo(6.5244, 4)
    const detail = await t.api(`/api/incidents/${r.body.incident.id}`)
    expect(detail.body.history).toHaveLength(1)
    expect(detail.body.history[0].to).toBe('pending')
    expect(t.realtime.events[0]).toMatchObject({ id: r.body.incident.id, kind: 'created' })
  })

  test('still succeeds when the realtime mirror is down', async () => {
    t.realtime.fail = true
    const r = await t.api('/api/incidents', { as: 'alice', body: reportBody() })
    t.realtime.fail = false
    expect(r.status).toBe(201)
  })

  test('rejects coordinates outside Nigeria and future or stale times', async () => {
    const far = await t.api('/api/incidents', { as: 'alice', body: reportBody({ latitude: 51.5, longitude: -0.12 }) })
    expect(far.status).toBe(400)
    expect(far.body.error.code).toBe('validation_failed')
    const future = await t.api('/api/incidents', { as: 'alice', body: reportBody({ occurredAt: new Date(Date.now() + 3600_000).toISOString() }) })
    expect(future.status).toBe(400)
    const old = await t.api('/api/incidents', { as: 'alice', body: reportBody({ occurredAt: new Date(Date.now() - 30 * 86400_000).toISOString() }) })
    expect(old.status).toBe(400)
  })

  test('rejects unknown categories, short text and malformed JSON safely', async () => {
    expect((await t.api('/api/incidents', { as: 'alice', body: reportBody({ categorySlug: 'nope' }) })).status).toBe(400)
    expect((await t.api('/api/incidents', { as: 'alice', body: reportBody({ title: 'x' }) })).status).toBe(400)
    const bad = await t.api('/api/incidents', { as: 'alice', raw: '{not json' })
    expect(bad.status).toBe(400)
    expect(bad.body.error.code).toBe('bad_json')
  })

  test('an identical retry replays the first result instead of duplicating', async () => {
    const body = reportBody()
    const a = await t.api('/api/incidents', { as: 'alice', body })
    const b = await t.api('/api/incidents', { as: 'alice', body })
    expect(a.status).toBe(201)
    expect(b.status).toBe(200)
    expect(b.body.replayed).toBe(true)
    expect(b.body.incident.id).toBe(a.body.incident.id)
  })

  test('concurrent double-submits create exactly one incident', async () => {
    const body = reportBody()
    const results = await Promise.all([1, 2, 3, 4].map(() => t.api('/api/incidents', { as: 'alice', body })))
    expect(results.every((r) => r.status === 200 || r.status === 201)).toBe(true)
    const n = await t.db.query('SELECT count(*)::int AS n FROM incidents')
    expect(n.rows[0].n).toBe(1)
  })

  test('blocks a near-identical report from the same user within minutes', async () => {
    await t.api('/api/incidents', { as: 'alice', body: reportBody() })
    const again = await t.api('/api/incidents', { as: 'alice', body: reportBody({ latitude: 6.5249 }) })
    expect(again.status).toBe(409)
    expect(again.body.error.code).toBe('duplicate_report')
    const other = await t.api('/api/incidents', { as: 'bob', body: reportBody() })
    expect(other.status).toBe(201)
  })
})

describe('search and filters', () => {
  async function seed() {
    await t.api('/api/incidents', { as: 'alice', body: reportBody({ title: 'Lagos accident at Third Mainland', state: 'Lagos' }) })
    await t.api('/api/incidents', {
      as: 'bob',
      body: reportBody({ categorySlug: 'flooding', title: 'Flooded road in Abuja', description: 'Water covers the whole road.', latitude: 9.0765, longitude: 7.3986, state: 'FCT' }),
    })
    await t.api('/api/incidents', {
      as: 'carol',
      body: reportBody({ categorySlug: 'armed-robbery', title: 'Robbery near Kaduna bypass', description: 'Armed men stopped vehicles.', latitude: 10.5105, longitude: 7.4165, state: 'Kaduna' }),
    })
  }

  test('lists open incidents publicly without exposing private data', async () => {
    await seed()
    const r = await t.api('/api/incidents')
    expect(r.status).toBe(200)
    expect(r.body.incidents).toHaveLength(3)
    expect(JSON.stringify(r.body)).not.toContain('example.test')
    expect(r.body.serverTime).toBeTruthy()
  })

  test('filters by category, text, bounding box, radius and date', async () => {
    await seed()
    expect((await t.api('/api/incidents?category=flooding')).body.incidents).toHaveLength(1)
    expect((await t.api('/api/incidents?category=flooding,accident')).body.incidents).toHaveLength(2)
    expect((await t.api('/api/incidents?q=kaduna')).body.incidents).toHaveLength(1)
    expect((await t.api('/api/incidents?q=100%25')).body.incidents).toHaveLength(0)
    // Abuja-only box
    expect((await t.api('/api/incidents?bbox=7,8.5,8,9.5')).body.incidents.map((i: { state: string }) => i.state)).toEqual(['FCT'])
    // 50 km around Lagos
    const near = await t.api('/api/incidents?lat=6.52&lng=3.38&radiusKm=50')
    expect(near.body.incidents).toHaveLength(1)
    expect(near.body.incidents[0].distanceM).toBeLessThan(2000)
    const future = new Date(Date.now() + 86400_000).toISOString()
    expect((await t.api(`/api/incidents?from=${encodeURIComponent(future)}`)).body.incidents).toHaveLength(0)
  })

  test('filters by status and validates query input', async () => {
    await seed()
    expect((await t.api('/api/incidents?status=verified')).body.incidents).toHaveLength(0)
    expect((await t.api('/api/incidents?status=pending')).body.incidents).toHaveLength(3)
    expect((await t.api('/api/incidents?status=bogus')).status).toBe(400)
    expect((await t.api('/api/incidents?bbox=1,2,3')).status).toBe(400)
    expect((await t.api('/api/incidents?limit=100000')).status).toBe(400)
  })

  test('categories endpoint returns reference data', async () => {
    const r = await t.api('/api/categories')
    expect(r.body.categories.length).toBeGreaterThanOrEqual(6)
  })
})

describe('area notifications and rate limits', () => {
  test('notifies followers of an area but not the reporter or distant users', async () => {
    await t.api('/api/me', { as: 'near' })
    await t.api('/api/me', { as: 'far' })
    await t.api('/api/me', { as: 'alice' })
    const sub = { latitude: 6.5, longitude: 3.4, radiusKm: 20 }
    expect((await t.api('/api/me/subscriptions', { as: 'near', body: sub })).status).toBe(201)
    expect((await t.api('/api/me/subscriptions', { as: 'alice', body: sub })).status).toBe(201)
    expect((await t.api('/api/me/subscriptions', { as: 'far', body: { latitude: 9.07, longitude: 7.39, radiusKm: 20 } })).status).toBe(201)

    await t.api('/api/incidents', { as: 'alice', body: reportBody() })
    expect((await t.api('/api/notifications', { as: 'near' })).body.unread).toBe(1)
    expect((await t.api('/api/notifications', { as: 'far' })).body.unread).toBe(0)
    expect((await t.api('/api/notifications', { as: 'alice' })).body.unread).toBe(0)
    expect(t.realtime.pushes.at(-1)?.userIds).toHaveLength(1)

    const list = (await t.api('/api/notifications', { as: 'near' })).body.notifications
    expect((await t.api(`/api/notifications/${list[0].id}/read`, { as: 'far', method: 'POST' })).status).toBe(404)
    expect((await t.api(`/api/notifications/${list[0].id}/read`, { as: 'near', method: 'POST' })).status).toBe(204)
    expect((await t.api('/api/notifications', { as: 'near' })).body.unread).toBe(0)
  })

  test('profile updates and device registration validate input', async () => {
    expect((await t.api('/api/me', { as: 'dana', method: 'PATCH', body: { displayName: 'D' } })).status).toBe(400)
    expect((await t.api('/api/me', { as: 'dana', method: 'PATCH', body: { displayName: 'Dana O.' } })).status).toBe(200)
    expect((await t.api('/api/me', { as: 'dana' })).body.user.displayName).toBe('Dana O.')
    expect((await t.api('/api/me/devices', { as: 'dana', body: { token: 'short' } })).status).toBe(400)
    expect((await t.api('/api/me/devices', { as: 'dana', body: { token: 'x'.repeat(40) } })).status).toBe(204)
  })
})
