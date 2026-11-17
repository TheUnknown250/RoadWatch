import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { reportBody, startTestApp } from './helpers'

const t = await startTestApp('features')
afterAll(() => t.close())

let id: number
beforeEach(async () => {
  await t.db.query('TRUNCATE users, incidents, verifications, incident_status_history, notifications, area_subscriptions RESTART IDENTITY CASCADE')
  t.realtime.events.length = 0
  t.realtime.pushes.length = 0
  await t.api('/api/me', { as: 'admin' }) // promoted by ADMIN_EMAILS
  id = (await t.api('/api/incidents', { as: 'reporter', body: reportBody() })).body.incident.id
})

describe('comments', () => {
  const post = (as: string, body: string) => t.api(`/api/incidents/${id}/comments`, { as, body: { body } })

  test('anyone can read, only signed-in users can post', async () => {
    expect((await t.api(`/api/incidents/${id}/comments`)).body.comments).toEqual([])
    expect((await t.api(`/api/incidents/${id}/comments`, { body: { body: 'hello there' } })).status).toBe(401)
  })

  test('posting notifies the reporter, but not for their own comment', async () => {
    const r = await post('witness', 'Police are on the scene now.')
    expect(r.status).toBe(201)
    expect(r.body.comment.author.displayName).toBe('witness')
    expect((await t.api('/api/notifications', { as: 'reporter' })).body.notifications[0].type).toBe('comment')
    expect(t.realtime.pushes).toHaveLength(1)
    await post('reporter', 'Thank you for the update')
    expect((await t.api('/api/notifications', { as: 'reporter' })).body.unread).toBe(1)
    expect((await t.api(`/api/incidents/${id}/comments`)).body.comments).toHaveLength(2)
  })

  test('validates length and unknown incidents', async () => {
    expect((await post('witness', 'x')).status).toBe(400)
    expect((await t.api('/api/incidents/99999/comments', { as: 'witness', body: { body: 'hello there' } })).status).toBe(404)
  })

  test('authors and moderators can remove comments, others cannot', async () => {
    const c = (await post('witness', 'Road is clear now')).body.comment
    const del = (as: string) => t.api(`/api/incidents/${id}/comments/${c.id}`, { as, method: 'DELETE' })
    expect((await del('stranger')).status).toBe(403)
    expect((await del('witness')).status).toBe(204)
    expect((await t.api(`/api/incidents/${id}/comments`)).body.comments).toHaveLength(0)
    // moderators still see it, flagged hidden
    expect((await t.api(`/api/incidents/${id}/comments`, { as: 'admin' })).body.comments[0].hidden).toBe(true)
  })

  test('comments are rate limited per user', async () => {
    const limited = await startTestApp('features_rl', { limits: { comment: 5 } })
    const rid = (await limited.api('/api/incidents', { as: 'reporter', body: reportBody() })).body.incident.id
    const codes: number[] = []
    for (let i = 0; i < 7; i++) {
      codes.push((await limited.api(`/api/incidents/${rid}/comments`, { as: 'chatty', body: { body: `message number ${i}` } })).status)
    }
    await limited.close()
    expect(codes.filter((c) => c === 201)).toHaveLength(5)
    expect(codes.at(-1)).toBe(429)
  })

  test('comments close once a report is rejected', async () => {
    await t.api(`/api/admin/incidents/${id}/status`, { as: 'admin', method: 'PATCH', body: { status: 'rejected', reason: 'Spam content' } })
    expect((await post('witness', 'Is this real?')).status).toBe(404) // hidden from non-owners
    expect((await post('reporter', 'It was real!')).status).toBe(409)
  })
})

describe('withdrawing a report', () => {
  test('the reporter can withdraw a pending report; it disappears publicly but stays in their list', async () => {
    const r = await t.api(`/api/incidents/${id}/withdraw`, { as: 'reporter', method: 'POST', body: {} })
    expect(r.status).toBe(200)
    expect(r.body.incident.status).toBe('withdrawn')
    expect((await t.api('/api/incidents')).body.incidents).toHaveLength(0)
    expect((await t.api(`/api/incidents/${id}`)).status).toBe(404)
    expect((await t.api('/api/me/incidents', { as: 'reporter' })).body.incidents.map((i: { status: string }) => i.status)).toEqual(['withdrawn'])
    const hist = (await t.api(`/api/incidents/${id}`, { as: 'reporter' })).body.history
    expect(hist.at(-1)).toMatchObject({ to: 'withdrawn', reason: 'Withdrawn by the reporter' })
    expect(t.realtime.events.at(-1)?.status).toBe('withdrawn')
  })

  test('others cannot withdraw it, and voting or re-withdrawing is closed', async () => {
    expect((await t.api(`/api/incidents/${id}/withdraw`, { as: 'other', method: 'POST', body: {} })).status).toBe(404)
    await t.api(`/api/incidents/${id}/withdraw`, { as: 'reporter', method: 'POST', body: {} })
    expect((await t.api(`/api/incidents/${id}/withdraw`, { as: 'reporter', method: 'POST', body: {} })).status).toBe(409)
    expect((await t.api(`/api/incidents/${id}/verifications`, { as: 'other', body: { vote: 'confirm' } })).status).toBe(404)
  })

  test('verified reports cannot be withdrawn', async () => {
    for (const u of ['a', 'b', 'c']) await t.api(`/api/incidents/${id}/verifications`, { as: u, body: { vote: 'confirm' } })
    const r = await t.api(`/api/incidents/${id}/withdraw`, { as: 'reporter', method: 'POST', body: {} })
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('cannot_withdraw')
  })

  test('moderators cannot set the withdrawn status, and rejected reports show in the reporter list', async () => {
    const bad = await t.api(`/api/admin/incidents/${id}/status`, { as: 'admin', method: 'PATCH', body: { status: 'withdrawn', reason: 'nope nope' } })
    expect(bad.status).toBe(400)
    await t.api(`/api/admin/incidents/${id}/status`, { as: 'admin', method: 'PATCH', body: { status: 'rejected', reason: 'Spam content' } })
    expect((await t.api('/api/me/incidents', { as: 'reporter' })).body.incidents[0].status).toBe('rejected')
  })
})

describe('insights', () => {
  async function seed() {
    await t.api('/api/incidents', { as: 'u1', body: reportBody({ categorySlug: 'armed-robbery', title: 'Robbery on bridge', latitude: 6.52, longitude: 3.38, state: 'Lagos' }) })
    await t.api('/api/incidents', { as: 'u2', body: reportBody({ categorySlug: 'armed-robbery', title: 'Another robbery', latitude: 6.521, longitude: 3.381, state: 'Lagos' }) })
    await t.api('/api/incidents', { as: 'u3', body: reportBody({ categorySlug: 'flooding', title: 'Flood in Abuja', latitude: 9.07, longitude: 7.39, state: 'FCT' }) })
  }

  test('summary counts reports, groups by category and state, and fills the trend', async () => {
    await seed()
    const s = (await t.api('/api/insights/summary?days=7')).body
    expect(s.total).toBe(4) // includes the report from beforeEach
    expect(s.byCategory.find((c: { slug: string }) => c.slug === 'armed-robbery').n).toBe(2)
    expect(s.byState[0]).toEqual({ state: 'Lagos', n: 3 })
    expect(s.trend).toHaveLength(7)
    expect(s.trend.reduce((a: number, d: { n: number }) => a + d.n, 0)).toBe(4)
  })

  test('summary excludes withdrawn and rejected reports and needs no sign-in', async () => {
    await t.api(`/api/incidents/${id}/withdraw`, { as: 'reporter', method: 'POST', body: {} })
    expect((await t.api('/api/insights/summary')).body.total).toBe(0)
  })

  test('hotspots only include areas with at least two reports', async () => {
    await seed()
    const h = (await t.api('/api/insights/hotspots')).body.hotspots
    expect(h).toHaveLength(1)
    expect(h[0].count).toBeGreaterThanOrEqual(2)
    expect(h[0].latitude).toBeCloseTo(6.52, 1)
    expect(h[0].topCategory).toBe('Armed robbery')
  })
})

describe('advisories', () => {
  const advisory = { title: 'Curfew on the highway', body: 'Avoid the road between 10pm and 5am.', severity: 'warning' as const }

  test('only admins publish; everyone can read active advisories', async () => {
    expect((await t.api('/api/admin/advisories', { as: 'reporter', body: advisory })).status).toBe(403)
    expect((await t.api('/api/admin/advisories', { as: 'admin', body: { ...advisory, title: 'x' } })).status).toBe(400)
    const ok = await t.api('/api/admin/advisories', { as: 'admin', body: advisory })
    expect(ok.status).toBe(201)
    const list = (await t.api('/api/advisories')).body.advisories
    expect(list).toHaveLength(1)
    expect(list[0].title).toBe('Curfew on the highway')
  })

  test('notify sends an alert to every active user and a push', async () => {
    await t.api('/api/me', { as: 'someone' })
    await t.api('/api/admin/advisories', { as: 'admin', body: { ...advisory, notify: true } })
    expect((await t.api('/api/notifications', { as: 'someone' })).body.notifications[0].type).toBe('advisory')
    expect(t.realtime.pushes.at(-1)?.userIds.length).toBeGreaterThanOrEqual(3)
  })

  test('ended advisories disappear', async () => {
    const a = (await t.api('/api/admin/advisories', { as: 'admin', body: advisory })).body.advisory
    expect((await t.api(`/api/admin/advisories/${a.id}`, { as: 'admin', method: 'DELETE' })).status).toBe(204)
    expect((await t.api('/api/advisories')).body.advisories).toHaveLength(0)
    expect((await t.api(`/api/admin/advisories/${a.id}`, { as: 'admin', method: 'DELETE' })).status).toBe(404)
  })
})

describe('account deletion', () => {
  test('removes personal data and keeps public reports under an anonymous name', async () => {
    await t.api('/api/me/subscriptions', { as: 'reporter', body: { latitude: 6.5, longitude: 3.4, radiusKm: 5 } })
    expect((await t.api('/api/me', { as: 'reporter', method: 'DELETE' })).status).toBe(204)
    const row = (await t.db.query("SELECT email, display_name, firebase_uid FROM users WHERE display_name = 'Deleted user'")).rows[0]
    expect(row.email).toBeNull()
    expect(row.firebase_uid).toStartWith('deleted-')
    expect((await t.db.query('SELECT count(*)::int AS n FROM area_subscriptions')).rows[0].n).toBe(0)
    const pub = (await t.api(`/api/incidents/${id}`)).body.incident
    expect(pub.reporter.displayName).toBe('Deleted user')
    // signing in again with the same identity starts a fresh, empty account
    expect((await t.api('/api/me', { as: 'reporter' })).body.user.reputation).toBe(0)
  })
})

describe('anonymous reporting', () => {
  let anonId: number
  beforeEach(async () => {
    anonId = (await t.api('/api/incidents', { as: 'whistle', body: reportBody({ isAnonymous: true, title: 'Seen near the market', latitude: 7 }) })).body.incident.id
    const own = await t.api(`/api/incidents/${anonId}/comments`, { as: 'whistle', body: { body: 'I can add more detail if needed' } })
    const other = await t.api(`/api/incidents/${anonId}/comments`, { as: 'witness', body: { body: 'I saw this too, confirmed.' } })
    expect([own.status, other.status]).toEqual([201, 201])
  })

  test('the public sees "Anonymous" everywhere: list, detail, history and the reporter\'s own comments', async () => {
    const list = (await t.api('/api/incidents')).body.incidents.find((i: { id: number }) => i.id === anonId)
    expect(list.reporter).toEqual({ id: 0, displayName: 'Anonymous' })
    expect(list.isAnonymous).toBe(true)
    const detail = (await t.api(`/api/incidents/${anonId}`, { as: 'witness' })).body
    expect(detail.incident.reporter.displayName).toBe('Anonymous')
    expect(detail.history[0].by).toBe('Anonymous')
    const comments = (await t.api(`/api/incidents/${anonId}/comments`, { as: 'witness' })).body.comments
    expect(comments.map((c: { author: { displayName: string } }) => c.author.displayName)).toEqual(['Anonymous reporter', 'witness'])
    expect(JSON.stringify([list, detail, comments])).not.toContain('whistle')
    // the anonymous reporter is still told about the comment, so they can reply
    expect((await t.api('/api/notifications', { as: 'whistle' })).body.notifications[0].type).toBe('comment')
  })

  test('voters cannot learn the reporter either, and the reporter keeps control of the report', async () => {
    const vote = await t.api(`/api/incidents/${anonId}/verifications`, { as: 'witness', body: { vote: 'confirm' } })
    expect(JSON.stringify(vote.body)).not.toContain('whistle')
    const mine = (await t.api(`/api/incidents/${anonId}`, { as: 'whistle' })).body
    expect(mine.incident.reporter.displayName).toBe('whistle')
    expect(mine.history[0].by).toBe('whistle')
    expect((await t.api(`/api/incidents/${anonId}/withdraw`, { as: 'whistle', body: {} })).status).toBe(200)
  })

  test('moderators can still see who reported it, and the reporter\'s own list shows it', async () => {
    const asAdmin = (await t.api(`/api/incidents/${anonId}`, { as: 'admin' })).body
    expect(asAdmin.incident.reporter.displayName).toBe('whistle')
    expect(asAdmin.history[0].by).toBe('whistle')
    expect((await t.api('/api/admin/incidents', { as: 'admin' })).body.incidents.find((i: { id: number }) => i.id === anonId).reporter.displayName).toBe('whistle')
    expect((await t.api('/api/me/incidents', { as: 'whistle' })).body.incidents[0].reporter.displayName).toBe('whistle')
  })

  test('reports are not anonymous unless the reporter asks', async () => {
    const open = (await t.api('/api/incidents', { as: 'named', body: reportBody({ latitude: 8 }) })).body.incident
    expect(open.isAnonymous).toBe(false)
    expect((await t.api(`/api/incidents/${open.id}`)).body.incident.reporter.displayName).toBe('named')
  })

  test('the new EyeReport categories exist', async () => {
    const slugs = (await t.api('/api/categories')).body.categories.map((c: { slug: string }) => c.slug)
    expect(slugs).toEqual(expect.arrayContaining(['fire', 'suspicious-activity', 'medical-emergency']))
  })
})
