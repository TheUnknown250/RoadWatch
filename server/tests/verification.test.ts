import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { reportBody, startTestApp } from './helpers'

const t = await startTestApp('verification', { limits: { vote: 100 } })
afterAll(() => t.close())

let id: number
beforeEach(async () => {
  await t.db.query('TRUNCATE users, incidents, verifications, incident_status_history, notifications RESTART IDENTITY CASCADE')
  t.realtime.events.length = 0
  const r = await t.api('/api/incidents', { as: 'reporter', body: reportBody() })
  id = r.body.incident.id
})

const vote = (as: string, v: 'confirm' | 'flag', reason?: string) =>
  t.api(`/api/incidents/${id}/verifications`, { as, body: { vote: v, reason } })

describe('community verification', () => {
  test('requires authentication', async () => {
    expect((await t.api(`/api/incidents/${id}/verifications`, { body: { vote: 'confirm' } })).status).toBe(401)
  })

  test('the reporter cannot vote on their own report', async () => {
    const r = await vote('reporter', 'confirm')
    expect(r.status).toBe(403)
  })

  test('records a confirmation and updates counts and myVote', async () => {
    const r = await vote('u1', 'confirm')
    expect(r.status).toBe(201)
    expect(r.body.incident.confirmCount).toBe(1)
    expect(r.body.incident.myVote).toBe('confirm')
    expect(r.body.incident.status).toBe('pending')
  })

  test('a user cannot vote twice, even by switching sides', async () => {
    expect((await vote('u1', 'confirm')).status).toBe(201)
    const again = await vote('u1', 'flag')
    expect(again.status).toBe(409)
    expect(again.body.error.code).toBe('already_voted')
    const row = await t.db.query('SELECT confirm_count, flag_count FROM incidents WHERE id = $1', [id])
    expect(row.rows[0]).toEqual({ confirm_count: 1, flag_count: 0 })
  })

  test('simultaneous duplicate votes count once', async () => {
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => vote('u1', 'confirm')))
    expect(results.filter((r) => r.status === 201)).toHaveLength(1)
    expect(results.filter((r) => r.status === 409)).toHaveLength(4)
    const row = await t.db.query('SELECT confirm_count FROM incidents WHERE id = $1', [id])
    expect(row.rows[0].confirm_count).toBe(1)
  })

  test('three confirmations verify the report, notify and reward the reporter', async () => {
    await vote('u1', 'confirm')
    await vote('u2', 'confirm')
    const third = await vote('u3', 'confirm')
    expect(third.body.incident.status).toBe('verified')
    const detail = await t.api(`/api/incidents/${id}`)
    expect(detail.body.history.map((h: { to: string }) => h.to)).toEqual(['pending', 'verified'])
    const n = await t.api('/api/notifications', { as: 'reporter' })
    expect(n.body.notifications[0].type).toBe('report_verified')
    expect((await t.api('/api/me', { as: 'reporter' })).body.user.reputation).toBe(1)
    expect(t.realtime.events.at(-1)).toMatchObject({ status: 'verified', confirmCount: 3 })
  })

  test('three flags dispute the report', async () => {
    await vote('u1', 'flag', 'Not real')
    await vote('u2', 'flag')
    expect((await vote('u3', 'flag')).body.incident.status).toBe('disputed')
    expect((await t.api('/api/notifications', { as: 'reporter' })).body.notifications[0].type).toBe('report_disputed')
  })

  test('validates the vote payload and incident id', async () => {
    expect((await t.api(`/api/incidents/${id}/verifications`, { as: 'u1', body: { vote: 'maybe' } })).status).toBe(400)
    expect((await t.api('/api/incidents/999999/verifications', { as: 'u1', body: { vote: 'confirm' } })).status).toBe(404)
    expect((await t.api('/api/incidents/abc/verifications', { as: 'u1', body: { vote: 'confirm' } })).status).toBe(400)
  })

  test('voting closes once an incident is resolved', async () => {
    await t.db.query("UPDATE incidents SET status = 'resolved' WHERE id = $1", [id])
    const r = await vote('u1', 'confirm')
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('voting_closed')
  })
})
