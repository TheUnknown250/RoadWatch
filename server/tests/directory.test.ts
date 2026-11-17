import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { startTestApp } from './helpers'

const t = await startTestApp('directory', { limits: { geocode: 1000 } })
afterAll(() => t.close())

beforeEach(async () => {
  await t.db.query('TRUNCATE users RESTART IDENTITY CASCADE')
  t.places.fail = {}
  t.places.searches.length = 0
  await t.api('/api/me', { as: 'admin' })
})

describe('emergency directory', () => {
  test('is public and always lists the national emergency number first, with its source', async () => {
    const r = await t.api('/api/directory')
    expect(r.status).toBe(200)
    const first = r.body.contacts[0]
    expect(first).toMatchObject({ phone: '112', state: null, verified: true })
    expect(first.sourceUrl).toContain('ncc.gov.ng')
    expect(r.body.contacts.every((c: { state: string | null }) => c.state === null)).toBe(true)
  })

  test('includes state numbers only for the chosen state, and marks unverified entries', async () => {
    const lagos = (await t.api('/api/directory?state=lagos')).body.contacts
    expect(lagos.map((c: { phone: string }) => c.phone)).toContain('767')
    const frsc = lagos.find((c: { phone: string }) => c.phone === '122')
    expect(frsc.verified).toBe(false)
    expect((await t.api('/api/directory?state=Kano')).body.contacts.map((c: { phone: string }) => c.phone)).not.toContain('767')
  })

  test('admins manage entries; others cannot; duplicates and bad numbers are refused', async () => {
    const body = { name: 'Kano State Fire Service', kind: 'fire', phone: '0800 000 1111', state: 'Kano', verified: false, sourceUrl: 'https://example.org/kano' }
    expect((await t.api('/api/admin/directory', { as: 'user', body })).status).toBe(403)
    const created = await t.api('/api/admin/directory', { as: 'admin', body })
    expect(created.status).toBe(201)
    expect((await t.api('/api/admin/directory', { as: 'admin', body })).status).toBe(409)
    expect((await t.api('/api/admin/directory', { as: 'admin', body: { ...body, phone: 'call me' } })).status).toBe(400)
    expect((await t.api('/api/directory?state=Kano')).body.contacts.some((c: { name: string }) => c.name === body.name)).toBe(true)
    expect((await t.api(`/api/admin/directory/${created.body.contact.id}`, { as: 'user', method: 'DELETE' })).status).toBe(403)
    expect((await t.api(`/api/admin/directory/${created.body.contact.id}`, { as: 'admin', method: 'DELETE' })).status).toBe(204)
    expect((await t.api(`/api/admin/directory/${created.body.contact.id}`, { as: 'admin', method: 'DELETE' })).status).toBe(404)
  })
})

describe('nearby services and place search', () => {
  test('lists hospitals, police and fire stations nearest first with distance and any phone number', async () => {
    const r = await t.api('/api/directory/nearby?lat=6.52&lng=3.38')
    expect(r.status).toBe(200)
    expect(r.body.services.map((s: { kind: string }) => s.kind)).toEqual(['police', 'hospital', 'fire'])
    expect(r.body.services[0].distanceM).toBeGreaterThan(900)
    expect(r.body.services[1].phone).toContain('+234')
    expect(r.body.attribution).toContain('OpenStreetMap')
    expect(r.body.partial).toBe(false)
  })

  test('survives one failing lookup but reports it, and errors when everything fails', async () => {
    t.places.fail = { fire: true }
    const part = await t.api('/api/directory/nearby?lat=6.52&lng=3.38')
    expect(part.body.partial).toBe(true)
    expect(part.body.services).toHaveLength(2)
    t.places.fail = { fire: true, police: true, hospital: true }
    expect((await t.api('/api/directory/nearby?lat=6.52&lng=3.38')).status).toBe(502)
  })

  test('validates coordinates and search text', async () => {
    expect((await t.api('/api/directory/nearby?lat=51&lng=0')).status).toBe(400)
    expect((await t.api('/api/directory/nearby?lat=6.5&lng=3.4&radiusKm=500')).status).toBe(400)
    expect((await t.api('/api/places/search?q=a')).status).toBe(400)
    const ok = await t.api('/api/places/search?q=Ikeja')
    expect(ok.body.places[0].label).toContain('Ikeja')
    expect(t.places.searches).toEqual(['Ikeja'])
  })

  test('place lookups are rate limited', async () => {
    const limited = await startTestApp('directory_rl', { limits: { geocode: 2 } })
    const codes: number[] = []
    for (let i = 0; i < 4; i++) codes.push((await limited.api('/api/places/search?q=Lagos')).status)
    await limited.close()
    expect(codes).toEqual([200, 200, 429, 429])
  })
})
