import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { expireStale } from '../services/incidents'
import { reportBody, startTestApp } from './helpers'

const t = await startTestApp('admin')
afterAll(() => t.close())

let id: number
beforeEach(async () => {
  await t.db.query('TRUNCATE users, incidents, verifications, incident_status_history, notifications RESTART IDENTITY CASCADE')
  t.realtime.events.length = 0
  // The test token for uid `admin` carries the configured admin email, so sign-in promotes it.
  await t.api('/api/me', { as: 'admin' })
  id = (await t.api('/api/incidents', { as: 'reporter', body: reportBody() })).body.incident.id
})

const promote = async (uid: string, role: string) => {
  await t.api('/api/me', { as: uid })
  const u = await t.db.query('SELECT id FROM users WHERE firebase_uid = $1', [uid])
  return t.api(`/api/admin/users/${u.rows[0].id}`, { as: 'admin', method: 'PATCH', body: { role } })
}

describe('authorization', () => {
  test('regular users and anonymous callers cannot use admin routes', async () => {
    expect((await t.api('/api/admin/incidents')).status).toBe(401)
    expect((await t.api('/api/admin/incidents', { as: 'reporter' })).status).toBe(403)
    expect((await t.api('/api/admin/users', { as: 'reporter' })).status).toBe(403)
  })

  test('a verified admin email is promoted on first sign-in', async () => {
    expect((await t.api('/api/me', { as: 'admin' })).body.user.role).toBe('admin')
    expect((await t.api('/api/me', { as: 'regular' })).body.user.role).toBe('user')
  })

  test('moderators can review but not manage users', async () => {
    expect((await promote('mod', 'moderator')).status).toBe(204)
    expect((await t.api('/api/admin/incidents', { as: 'mod' })).status).toBe(200)
    expect((await t.api('/api/admin/users', { as: 'mod' })).status).toBe(403)
  })

  test('admins cannot change their own role or suspension', async () => {
    const me = await t.db.query("SELECT id FROM users WHERE firebase_uid = 'admin'")
    const r = await t.api(`/api/admin/users/${me.rows[0].id}`, { as: 'admin', method: 'PATCH', body: { role: 'user' } })
    expect(r.status).toBe(409)
  })

  test('suspended users are locked out', async () => {
    await t.api('/api/me', { as: 'troll' })
    const u = await t.db.query("SELECT id FROM users WHERE firebase_uid = 'troll'")
    await t.api(`/api/admin/users/${u.rows[0].id}`, { as: 'admin', method: 'PATCH', body: { isBanned: true } })
    expect((await t.api('/api/me', { as: 'troll' })).status).toBe(403)
  })
})

describe('moderation', () => {
  test('lists the review queue and changes status with an audit trail and notification', async () => {
    const queue = await t.api('/api/admin/incidents', { as: 'admin' })
    expect(queue.body.incidents.map((i: { id: number }) => i.id)).toContain(id)

    const r = await t.api(`/api/admin/incidents/${id}/status`, { as: 'admin', method: 'PATCH', body: { status: 'rejected', reason: 'Spam content' } })
    expect(r.status).toBe(200)
    expect(r.body.incident.status).toBe('rejected')

    const detail = await t.api(`/api/incidents/${id}`, { as: 'admin' })
    expect(detail.body.history.at(-1)).toMatchObject({ to: 'rejected', reason: 'Spam content', by: 'admin' })
    expect((await t.api('/api/notifications', { as: 'reporter' })).body.notifications[0].title).toContain('rejected')
  })

  test('rejected reports are hidden from the public and other users, but not their reporter', async () => {
    await t.api(`/api/admin/incidents/${id}/status`, { as: 'admin', method: 'PATCH', body: { status: 'rejected', reason: 'Spam content' } })
    expect((await t.api(`/api/incidents/${id}`)).status).toBe(404)
    expect((await t.api(`/api/incidents/${id}`, { as: 'someone' })).status).toBe(404)
    expect((await t.api(`/api/incidents/${id}`, { as: 'reporter' })).status).toBe(200)
    expect((await t.api('/api/incidents?status=rejected')).body.incidents).toHaveLength(0)
  })

  test('a moderator decision is not overridden by later community votes', async () => {
    await t.api(`/api/admin/incidents/${id}/status`, { as: 'admin', method: 'PATCH', body: { status: 'verified', reason: 'Confirmed with police' } })
    for (const u of ['v1', 'v2', 'v3']) await t.api(`/api/incidents/${id}/verifications`, { as: u, body: { vote: 'flag' } })
    const row = await t.db.query('SELECT status, flag_count FROM incidents WHERE id = $1', [id])
    expect(row.rows[0]).toEqual({ status: 'verified', flag_count: 3 })
  })

  test('validates moderation input', async () => {
    const path = `/api/admin/incidents/${id}/status`
    expect((await t.api(path, { as: 'admin', method: 'PATCH', body: { status: 'verified' } })).status).toBe(400)
    expect((await t.api(path, { as: 'admin', method: 'PATCH', body: { status: 'pending', reason: 'undo this' } })).status).toBe(400)
    expect((await t.api(path, { as: 'admin', method: 'PATCH', body: { status: 'resolved', reason: 'Cleared' } })).status).toBe(200)
    expect((await t.api(path, { as: 'admin', method: 'PATCH', body: { status: 'resolved', reason: 'Cleared' } })).status).toBe(409)
  })

  test('reports stats', async () => {
    const s = await t.api('/api/admin/stats', { as: 'admin' })
    expect(s.body.byStatus.pending).toBe(1)
    expect(s.body.users).toBeGreaterThanOrEqual(2)
  })
})

describe('expiry and rate limiting', () => {
  test('overdue incidents expire and leave the default feed', async () => {
    await t.db.query("UPDATE incidents SET expires_at = now() - interval '1 minute' WHERE id = $1", [id])
    expect((await t.api('/api/incidents')).body.incidents).toHaveLength(0)
    const n = await expireStale({ db: t.db, config: (await import('../config')).loadConfig({}), realtime: t.realtime })
    expect(n).toBe(1)
    expect((await t.api(`/api/incidents/${id}`)).body.incident.status).toBe('expired')
  })

  test('report submissions are rate limited per user', async () => {
    const limited = await startTestApp('admin_rl', { limits: { report: 3 } })
    const codes: number[] = []
    for (let i = 0; i < 5; i++) {
      codes.push((await limited.api('/api/incidents', { as: 'spammer', body: reportBody({ latitude: 6 + i * 0.5 }) })).status)
    }
    expect(codes).toEqual([201, 201, 201, 429, 429])
    // another user is unaffected
    expect((await limited.api('/api/incidents', { as: 'other', body: reportBody() })).status).toBe(201)
    await limited.close()
  })
})
