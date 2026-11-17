import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { confidenceFor, levelFor, riskPoints, scoreFromRisk } from '../services/safetyScan'
import { reportBody, startTestApp } from './helpers'

const t = await startTestApp('scan')
afterAll(() => t.close())
beforeEach(() => t.db.query('TRUNCATE users, incidents, verifications, incident_status_history, notifications RESTART IDENTITY CASCADE'))

describe('scoring rules', () => {
  const base = { status: 'verified', severity: 3, ageDays: 0, distanceM: 0 }
  test('verified, recent, close, severe reports weigh the most', () => {
    expect(riskPoints(base, 5000)).toBe(3)
    expect(riskPoints({ ...base, status: 'disputed' }, 5000)).toBeLessThan(riskPoints({ ...base, status: 'pending' }, 5000))
    expect(riskPoints({ ...base, ageDays: 7 }, 5000)).toBeCloseTo(1.5, 5) // halves every 7 days
    expect(riskPoints({ ...base, distanceM: 5000 }, 5000)).toBeCloseTo(1.5, 5)
    expect(riskPoints({ ...base, severity: 1 }, 5000)).toBeLessThan(riskPoints(base, 5000))
  })
  test('score falls monotonically and maps to colour bands', () => {
    expect(scoreFromRisk(0)).toBe(100)
    expect(scoreFromRisk(4)).toBeGreaterThan(scoreFromRisk(10))
    expect([100, 80, 79, 60, 59, 40, 39, 0].map(levelFor)).toEqual(['safe', 'safe', 'caution', 'caution', 'elevated', 'elevated', 'danger', 'danger'])
  })
  test('confidence reflects how many reports there are', () => {
    expect([0, 1, 2, 3, 9, 10].map(confidenceFor)).toEqual(['none', 'low', 'low', 'medium', 'medium', 'high'])
  })
})

describe('GET /insights/scan', () => {
  const scan = (q = 'lat=6.52&lng=3.38&radiusKm=10') => t.api(`/api/insights/scan?${q}`)

  test('an area with no reports scores 100 with no confidence and says so', async () => {
    const r = await scan()
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ score: 100, level: 'safe', confidence: 'none', total: 0 })
    expect(r.body.advice[0]).toContain('coverage depends on users')
  })

  test('serious verified reports lower the score and bring category-specific advice', async () => {
    for (let i = 0; i < 3; i++) {
      const rep = await t.api('/api/incidents', { as: `u${i}`, body: reportBody({ categorySlug: 'armed-robbery', title: `Robbery ${i}`, latitude: 6.52 + i * 0.001 }) })
      await t.db.query("UPDATE incidents SET status = 'verified' WHERE id = $1", [rep.body.incident.id])
    }
    const r = (await scan()).body
    expect(r.total).toBe(3)
    expect(r.score).toBeLessThan(60)
    expect(['elevated', 'danger']).toContain(r.level)
    expect(r.threats[0]).toMatchObject({ slug: 'armed-robbery', n: 3 })
    expect(r.threats[0].advice).toContain('after dark')
    expect(r.method).toContain('e^(-risk/8)')
  })

  test('reports outside the radius, rejected or withdrawn reports do not count', async () => {
    const far = await t.api('/api/incidents', { as: 'a', body: reportBody({ latitude: 9.07, longitude: 7.39 }) })
    const mine = await t.api('/api/incidents', { as: 'b', body: reportBody() })
    await t.api(`/api/incidents/${mine.body.incident.id}/withdraw`, { as: 'b', body: {} })
    expect(far.status).toBe(201)
    expect((await scan()).body.total).toBe(0)
  })

  test('validates coordinates, radius and window', async () => {
    expect((await scan('lat=51&lng=0')).status).toBe(400)
    expect((await scan('lat=6.5&lng=3.4&radiusKm=500')).status).toBe(400)
    expect((await scan('lat=6.5&lng=3.4&days=1000')).status).toBe(400)
    expect((await t.api('/api/insights/scan')).status).toBe(400)
  })
})
