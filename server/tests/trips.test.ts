import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import {
  departure, distanceM, habitCandidates, mergeCandidates, scheduledCandidates, watParts, watTimeToday, type PlaceRow,
} from '../services/trips'
import { startTestApp, straightRoute } from './helpers'

// Monday 9 November 2026, 06:45 West Africa Time (05:45 UTC).
const NOW = new Date('2026-11-09T05:45:00Z')
let clock = NOW
const t = await startTestApp('trips', { now: () => clock })
afterAll(() => t.close())

const HOME = { lat: 6.5, lng: 3.35 }
const OFFICE = { lat: 6.6, lng: 3.4 }

beforeEach(async () => {
  await t.db.query('TRUNCATE users, incidents, notifications RESTART IDENTITY CASCADE')
  clock = NOW
  t.routing.error = null
  t.routing.routes = []
})

const place = (over: Partial<PlaceRow> = {}): PlaceRow => ({ id: 1, label: 'Office', kind: 'work', lat: OFFICE.lat, lng: OFFICE.lng, typicalDays: [], arriveBy: '09:00:00', ...over })

describe('West Africa Time helpers', () => {
  test('converts instants to WAT day parts and back', () => {
    expect(watParts(NOW)).toEqual({ dow: 1, minutes: 6 * 60 + 45, weekend: false })
    expect(watParts(new Date('2026-11-07T23:30:00Z'))).toMatchObject({ dow: 0, weekend: true }) // already Sunday in Lagos
    expect(watTimeToday(NOW, '09:00').toISOString()).toBe('2026-11-09T08:00:00.000Z')
  })
})

describe('suggestion rules', () => {
  test('scheduled places appear within three hours of the arrival time, on their days only', () => {
    expect(scheduledCandidates([place()], NOW)).toHaveLength(1)
    expect(scheduledCandidates([place({ typicalDays: [2, 3] })], NOW)).toHaveLength(0) // Monday is 1
    expect(scheduledCandidates([place({ typicalDays: [1] })], NOW)).toHaveLength(1)
    expect(scheduledCandidates([place({ arriveBy: '15:00:00' })], NOW)).toHaveLength(0) // too far ahead
    expect(scheduledCandidates([place({ arriveBy: '06:00:00' })], NOW)).toHaveLength(0) // already passed
    expect(scheduledCandidates([place({ arriveBy: null })], NOW)).toHaveLength(0)
  })

  test('habits match weekday vs weekend and a window around the usual leave time', () => {
    const h = { lat: OFFICE.lat, lng: OFFICE.lng, label: 'Office', count: 4, avgMinutes: 7 * 60 + 30, weekend: false }
    expect(habitCandidates([h], NOW)).toHaveLength(1)
    expect(habitCandidates([{ ...h, weekend: true }], NOW)).toHaveLength(0)
    expect(habitCandidates([{ ...h, avgMinutes: 12 * 60 }], NOW)).toHaveLength(0)
    expect(habitCandidates([h], NOW)[0].reason).toContain('4 times')
  })

  test('merging drops the current location, duplicates, and prefers scheduled over habit', () => {
    const sched = scheduledCandidates([place()], NOW)
    const habit = habitCandidates([{ lat: OFFICE.lat + 0.0005, lng: OFFICE.lng, label: 'Office', count: 3, avgMinutes: 7 * 60, weekend: false }], NOW)
    const merged = mergeCandidates(sched, habit, HOME)
    expect(merged).toHaveLength(1)
    expect(merged[0].kind).toBe('scheduled')
    expect(mergeCandidates(sched, [], OFFICE)).toHaveLength(0)
  })

  test('departure = arrival target minus travel time minus a 10 minute buffer, or now if late', () => {
    const c = scheduledCandidates([place()], NOW)[0] // arrive by 09:00 WAT = 08:00Z
    const d = departure(c, 30 * 60, NOW)
    expect(d.leaveAt.toISOString()).toBe('2026-11-09T07:20:00.000Z')
    expect(d.leaveNow).toBe(false)
    expect(departure(c, 3 * 3600, NOW).leaveNow).toBe(true)
    expect(distanceM(HOME, HOME)).toBe(0)
    expect(distanceM(HOME, OFFICE)).toBeGreaterThan(10_000)
  })
})

describe('API', () => {
  const suggestions = () => t.api(`/api/trips/suggestions?lat=${HOME.lat}&lng=${HOME.lng}`, { as: 'rider' })

  test('everything needs sign-in', async () => {
    expect((await t.api(`/api/trips/suggestions?lat=6.5&lng=3.3`)).status).toBe(401)
    expect((await t.api('/api/me/places')).status).toBe(401)
  })

  test('saved places can be added, listed, limited and removed by their owner only', async () => {
    const body = { label: 'Office', kind: 'work', latitude: OFFICE.lat, longitude: OFFICE.lng, typicalDays: [1, 2, 3, 4, 5], arriveBy: '09:00' }
    const add = await t.api('/api/me/places', { as: 'rider', body })
    expect(add.status).toBe(201)
    const list = (await t.api('/api/me/places', { as: 'rider' })).body.places
    expect(list[0]).toMatchObject({ label: 'Office', arriveBy: '09:00', typicalDays: [1, 2, 3, 4, 5] })
    expect((await t.api('/api/me/places', { as: 'rider', body: { ...body, arriveBy: '25:00' } })).status).toBe(400)
    expect((await t.api('/api/me/places', { as: 'rider', body: { ...body, latitude: 51 } })).status).toBe(400)
    expect((await t.api(`/api/me/places/${add.body.id}`, { as: 'other', method: 'DELETE' })).status).toBe(404)
    expect((await t.api(`/api/me/places/${add.body.id}`, { as: 'rider', method: 'DELETE' })).status).toBe(204)
    for (let i = 0; i < 10; i++) await t.api('/api/me/places', { as: 'rider', body })
    expect((await t.api('/api/me/places', { as: 'rider', body })).status).toBe(400)
  })

  test('a scheduled place becomes a suggestion with a computed leave time, ETA and safety score', async () => {
    await t.api('/api/me/places', { as: 'rider', body: { label: 'Office', kind: 'work', latitude: OFFICE.lat, longitude: OFFICE.lng, arriveBy: '09:00' } })
    t.routing.routes = [{ ...straightRoute(HOME, OFFICE), durationS: 1800 }]
    const s = (await suggestions()).body
    expect(s.enabled).toBe(true)
    expect(s.suggestions).toHaveLength(1)
    expect(s.suggestions[0]).toMatchObject({ kind: 'scheduled', label: 'Office', etaMinutes: 30, leaveNow: false, safetyScore: 100 })
    expect(s.suggestions[0].leaveAt).toBe('2026-11-09T07:20:00.000Z')
  })

  test('habits from trip history are learned once there are three similar trips', async () => {
    const u = await t.api('/api/me', { as: 'rider' })
    for (let i = 0; i < 2; i++) {
      await t.api('/api/trips', { as: 'rider', body: { from: HOME, to: OFFICE, destinationLabel: 'Office' } })
    }
    expect((await suggestions()).body.suggestions).toHaveLength(0)
    // Three past weekday trips leaving at 07:30 WAT (06:30 UTC).
    await t.db.query('DELETE FROM trip_history')
    await t.db.query(
      `INSERT INTO trip_history (user_id, origin, destination, destination_label, started_at)
       SELECT $1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, 'Office',
              ((d::date + time '06:30') AT TIME ZONE 'UTC')
         FROM generate_series(now() - interval '20 days', now() - interval '1 day', interval '1 day') d
        WHERE extract(isodow FROM d) < 6 LIMIT 4`,
      [u.body.user.id, HOME.lng, HOME.lat, OFFICE.lng, OFFICE.lat],
    )
    const s = (await suggestions()).body.suggestions
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ kind: 'habit', label: 'Office' })
    expect(s[0].reason).toContain('07:30')
    expect(s[0].leaveAt).toBe('2026-11-09T06:30:00.000Z')
  })

  test('the toggle turns suggestions off, and history can be erased', async () => {
    await t.api('/api/me/places', { as: 'rider', body: { label: 'Office', latitude: OFFICE.lat, longitude: OFFICE.lng, arriveBy: '09:00' } })
    await t.api('/api/trips', { as: 'rider', body: { from: HOME, to: OFFICE } })
    const off = await t.api('/api/me/settings', { as: 'rider', method: 'PATCH', body: { tripSuggestions: false } })
    expect(off.body.settings.tripSuggestions).toBe(false)
    expect((await suggestions()).body).toMatchObject({ enabled: false, suggestions: [] })
    expect((await t.api('/api/trips/history', { as: 'rider', method: 'DELETE' })).status).toBe(204)
    expect((await t.db.query('SELECT count(*)::int AS n FROM trip_history')).rows[0].n).toBe(0)
    expect((await t.api('/api/me/settings', { as: 'rider', method: 'PATCH', body: { tripSuggestions: 'yes' } })).status).toBe(400)
  })

  test('a routing outage still lists the suggestion, flagged without a route', async () => {
    await t.api('/api/me/places', { as: 'rider', body: { label: 'Office', latitude: OFFICE.lat, longitude: OFFICE.lng, arriveBy: '09:00' } })
    t.routing.error = new (await import('../errors')).HttpError(502, 'routing_unavailable', 'Routing is down')
    const s = (await suggestions()).body.suggestions[0]
    expect(s.etaMinutes).toBeNull()
    expect(s.routeError).toBe('Routing is down')
  })
})
