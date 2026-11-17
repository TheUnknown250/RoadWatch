import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { sweepOverdueTrips } from '../services/safety'
import { startTestApp } from './helpers'

const t = await startTestApp('safety', { limits: { sos: 100, location: 1000 } })
afterAll(() => t.close())

const HERE = { latitude: 6.52, longitude: 3.38 }
const DEST = { lat: 6.6, lng: 3.4 }
const ctx = () => ({ db: t.db, config: t.config, realtime: t.realtime })

beforeEach(async () => {
  await t.db.query('TRUNCATE users, incidents, notifications RESTART IDENTITY CASCADE')
  t.realtime.pushes.length = 0
})

/** `rider` owns a family community that `mum` and `dad` have joined. `stranger` is in nothing. */
async function circle() {
  const c = (await t.api('/api/communities', { as: 'rider', body: { name: 'Family circle', type: 'family' } })).body.community
  for (const u of ['mum', 'dad']) await t.api('/api/communities/join', { as: u, body: { code: c.inviteCode } })
  await t.api('/api/me', { as: 'stranger' })
  await t.db.query('DELETE FROM notifications')
  return c as { id: number }
}
const unread = async (u: string) => (await t.api('/api/notifications', { as: u })).body
const trip = (over: Record<string, unknown> = {}) => ({
  ...HERE, destination: DEST, destinationLabel: 'Office', expectedArrivalAt: new Date(Date.now() + 30 * 60_000).toISOString(), graceMinutes: 15, communityIds: [] as number[], ...over,
})

describe('SOS alerts', () => {
  test('need sign-in and valid coordinates', async () => {
    expect((await t.api('/api/safety/sos', { body: HERE })).status).toBe(401)
    expect((await t.api('/api/safety/sos', { as: 'rider', body: { latitude: 51, longitude: 0 } })).status).toBe(400)
  })

  test('notify every other member of the user\'s communities, with push, and nobody else', async () => {
    await circle()
    const r = await t.api('/api/safety/sos', { as: 'rider', body: { ...HERE, message: 'Followed by a car' } })
    expect(r.status).toBe(201)
    expect(r.body.notified).toBe(2)
    expect(r.body.session).toMatchObject({ kind: 'sos', status: 'active', mine: true, message: 'Followed by a car' })
    const mum = (await unread('mum')).notifications[0]
    expect(mum).toMatchObject({ type: 'sos', title: 'SOS from rider' })
    expect(mum.body).toBe('Followed by a car')
    expect((await unread('stranger')).unread).toBe(0)
    expect((await unread('rider')).unread).toBe(0)
    expect(t.realtime.pushes.at(-1)?.userIds.sort()).toHaveLength(2)
  })

  test('a second press returns the open alert instead of alerting everyone again', async () => {
    await circle()
    const a = await t.api('/api/safety/sos', { as: 'rider', body: HERE })
    const b = await t.api('/api/safety/sos', { as: 'rider', body: HERE })
    expect(b.status).toBe(200)
    expect(b.body.existing).toBe(true)
    expect(b.body.session.id).toBe(a.body.session.id)
    expect((await unread('mum')).unread).toBe(1)
  })

  test('with no community nobody is notified, and the response says so', async () => {
    const r = await t.api('/api/safety/sos', { as: 'loner', body: HERE })
    expect(r.status).toBe(201)
    expect(r.body.notified).toBe(0)
  })

  test('respects the "share SOS with communities" setting', async () => {
    await circle()
    await t.api('/api/me/settings', { as: 'rider', method: 'PATCH', body: { shareSosWithCommunities: false } })
    expect((await t.api('/api/safety/sos', { as: 'rider', body: HERE })).body.notified).toBe(0)
  })

  test('members follow the live location; outsiders cannot', async () => {
    await circle()
    const id = (await t.api('/api/safety/sos', { as: 'rider', body: HERE })).body.session.id
    await t.api(`/api/safety/${id}/location`, { as: 'rider', body: { latitude: 6.53, longitude: 3.39 } })
    const seen = (await t.api(`/api/safety/${id}`, { as: 'mum' })).body.session
    expect(seen.lastLocation).toEqual({ lat: 6.53, lng: 3.39 })
    expect(seen.mine).toBe(false)
    expect((await t.api('/api/safety/shared', { as: 'dad' })).body.sessions[0].owner.displayName).toBe('rider')
    expect((await t.api(`/api/safety/${id}`, { as: 'stranger' })).status).toBe(404)
    expect((await t.api('/api/safety/shared', { as: 'stranger' })).body.sessions).toEqual([])
    expect((await t.api(`/api/safety/${id}/location`, { as: 'mum', body: HERE })).status).toBe(404) // only the owner can move it
  })

  test('marking safe tells watchers and erases the stored location', async () => {
    await circle()
    const id = (await t.api('/api/safety/sos', { as: 'rider', body: HERE })).body.session.id
    const ended = await t.api(`/api/safety/${id}/end`, { as: 'rider', body: { outcome: 'safe' } })
    expect(ended.body.session).toMatchObject({ status: 'ended', outcome: 'safe', lastLocation: null })
    expect((await unread('mum')).notifications[0].title).toBe('rider is safe')
    expect((await t.db.query('SELECT last_location FROM safety_sessions WHERE id = $1', [id])).rows[0].last_location).toBeNull()
    expect((await t.api(`/api/safety/${id}/location`, { as: 'rider', body: HERE })).status).toBe(409)
    expect((await t.api('/api/safety/shared', { as: 'mum' })).body.sessions).toEqual([])
    expect((await t.api('/api/safety/mine', { as: 'rider' })).body.sessions).toEqual([])
  })

  test('cancelling tells watchers it was a false alarm; a trip outcome is rejected for SOS', async () => {
    await circle()
    const id = (await t.api('/api/safety/sos', { as: 'rider', body: HERE })).body.session.id
    expect((await t.api(`/api/safety/${id}/end`, { as: 'rider', body: { outcome: 'arrived' } })).status).toBe(409)
    await t.api(`/api/safety/${id}/end`, { as: 'rider', body: { outcome: 'cancelled' } })
    expect((await unread('mum')).notifications[0].body).toContain('false alarm')
  })
})

describe('trip monitor', () => {
  test('shares only with chosen communities the user belongs to', async () => {
    const c = await circle()
    const other = (await t.api('/api/communities', { as: 'stranger', body: { name: 'Not mine', type: 'other' } })).body.community
    const r = await t.api('/api/safety/trips', { as: 'rider', body: trip({ communityIds: [c.id, other.id] }) })
    expect(r.status).toBe(201)
    expect(r.body.session.communities).toEqual([{ id: c.id, name: 'Family circle' }])
    expect((await unread('mum')).notifications[0].type).toBe('trip_started')
    expect((await unread('stranger')).unread).toBe(0)
  })

  test('one trip at a time, and validates the arrival time', async () => {
    await circle()
    expect((await t.api('/api/safety/trips', { as: 'rider', body: trip({ expectedArrivalAt: new Date(Date.now() - 60_000).toISOString() }) })).status).toBe(400)
    expect((await t.api('/api/safety/trips', { as: 'rider', body: trip({ expectedArrivalAt: new Date(Date.now() + 48 * 3600_000).toISOString() }) })).status).toBe(400)
    expect((await t.api('/api/safety/trips', { as: 'rider', body: trip() })).status).toBe(201)
    const again = await t.api('/api/safety/trips', { as: 'rider', body: trip() })
    expect(again.status).toBe(409)
    expect(again.body.error.code).toBe('trip_in_progress')
  })

  test('arriving at the destination ends the trip automatically and reassures watchers', async () => {
    const c = await circle()
    const id = (await t.api('/api/safety/trips', { as: 'rider', body: trip({ communityIds: [c.id] }) })).body.session.id
    const far = await t.api(`/api/safety/${id}/location`, { as: 'rider', body: { latitude: 6.55, longitude: 3.39 } })
    expect(far.body.session.status).toBe('active')
    const near = await t.api(`/api/safety/${id}/location`, { as: 'rider', body: { latitude: DEST.lat + 0.0005, longitude: DEST.lng } })
    expect(near.body.session).toMatchObject({ status: 'ended', outcome: 'arrived' })
    const titles = (await unread('dad')).notifications.map((n: { title: string }) => n.title)
    expect(titles).toContain('rider arrived safely')
  })

  test('a trip that is not finished by arrival time plus grace is flagged overdue once and watchers are warned', async () => {
    const c = await circle()
    const id = (await t.api('/api/safety/trips', { as: 'rider', body: trip({ communityIds: [c.id], graceMinutes: 5 }) })).body.session.id
    expect(await sweepOverdueTrips(ctx())).toBe(0)
    await t.db.query("UPDATE safety_sessions SET expected_arrival = now() - interval '10 minutes' WHERE id = $1", [id])
    expect(await sweepOverdueTrips(ctx())).toBe(1)
    expect(await sweepOverdueTrips(ctx())).toBe(0)
    const n = (await unread('mum')).notifications.find((x: { type: string }) => x.type === 'trip_overdue')
    expect(n.title).toBe('rider has not arrived')
    expect((await t.api(`/api/safety/${id}`, { as: 'mum' })).body.session.status).toBe('overdue')
    // an overdue traveller can still check in as arrived
    const done = await t.api(`/api/safety/${id}/end`, { as: 'rider', body: { outcome: 'arrived' } })
    expect(done.body.session.outcome).toBe('arrived')
  })

  test('cancelling a trip tells watchers; SOS-only outcomes are refused for trips', async () => {
    const c = await circle()
    const id = (await t.api('/api/safety/trips', { as: 'rider', body: trip({ communityIds: [c.id] }) })).body.session.id
    expect((await t.api(`/api/safety/${id}/end`, { as: 'rider', body: { outcome: 'safe' } })).status).toBe(409)
    await t.api(`/api/safety/${id}/end`, { as: 'rider', body: { outcome: 'cancelled' } })
    expect((await unread('mum')).notifications[0].title).toBe('rider ended their trip')
  })

  test('location updates are rate limited per user', async () => {
    const limited = await startTestApp('safety_rl', { limits: { location: 3 } })
    const id = (await limited.api('/api/safety/sos', { as: 'rider', body: HERE })).body.session.id
    const codes: number[] = []
    for (let i = 0; i < 5; i++) codes.push((await limited.api(`/api/safety/${id}/location`, { as: 'rider', body: HERE })).status)
    await limited.close()
    expect(codes).toEqual([200, 200, 200, 429, 429])
  })
})
