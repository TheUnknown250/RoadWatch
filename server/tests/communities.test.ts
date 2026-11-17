import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { newInviteCode } from '../services/communities'
import { startTestApp } from './helpers'

const t = await startTestApp('communities', { limits: { post: 1000 } })
afterAll(() => t.close())
beforeEach(async () => {
  await t.db.query('TRUNCATE users, incidents, notifications RESTART IDENTITY CASCADE')
  t.realtime.pushes.length = 0
})

async function family() {
  const c = (await t.api('/api/communities', { as: 'owner', body: { name: 'Okafor Family', type: 'family', description: 'Our circle' } })).body.community
  return c as { id: number; inviteCode: string }
}

describe('invite codes', () => {
  test('are 8 characters from an unambiguous alphabet and unique', () => {
    const codes = new Set(Array.from({ length: 200 }, newInviteCode))
    expect(codes.size).toBe(200)
    for (const c of codes) expect(c).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)
  })
})

describe('creating and joining', () => {
  test('requires sign-in and valid input', async () => {
    expect((await t.api('/api/communities')).status).toBe(401)
    expect((await t.api('/api/communities', { as: 'owner', body: { name: 'x', type: 'family' } })).status).toBe(400)
    expect((await t.api('/api/communities', { as: 'owner', body: { name: 'Valid name', type: 'gang' } })).status).toBe(400)
  })

  test('the creator becomes owner and sees the invite code; members do not', async () => {
    const c = await family()
    expect(c.inviteCode).toMatch(/^[A-Z2-9]{8}$/)
    const joined = await t.api('/api/communities/join', { as: 'ada', body: { code: c.inviteCode.toLowerCase() } })
    expect(joined.status).toBe(200)
    expect(joined.body.community).toMatchObject({ myRole: 'member', memberCount: 2, inviteCode: null })
    expect((await t.api('/api/communities', { as: 'owner' })).body.communities[0]).toMatchObject({ myRole: 'owner', memberCount: 2 })
    expect((await t.api('/api/notifications', { as: 'owner' })).body.notifications[0].type).toBe('community_joined')
  })

  test('bad codes, repeat joins and non-members are handled safely', async () => {
    const c = await family()
    expect((await t.api('/api/communities/join', { as: 'ada', body: { code: 'ZZZZZZZZ' } })).status).toBe(404)
    expect((await t.api('/api/communities/join', { as: 'ada', body: { code: 'bad!' } })).status).toBe(400)
    await t.api('/api/communities/join', { as: 'ada', body: { code: c.inviteCode } })
    expect((await t.api('/api/communities/join', { as: 'ada', body: { code: c.inviteCode } })).status).toBe(409)
    // A stranger cannot tell a private community exists.
    for (const path of [`/${c.id}`, `/${c.id}/members`, `/${c.id}/posts`]) {
      expect((await t.api(`/api/communities${path}`, { as: 'stranger' })).status).toBe(404)
    }
  })

  test('owners can create only a limited number of communities', async () => {
    for (let i = 0; i < 10; i++) await t.api('/api/communities', { as: 'owner', body: { name: `Group ${i} here`, type: 'other' } })
    const r = await t.api('/api/communities', { as: 'owner', body: { name: 'One too many', type: 'other' } })
    expect(r.status).toBe(409)
    expect(r.body.error.code).toBe('limit_reached')
  })
})

describe('membership management', () => {
  async function withMembers() {
    const c = await family()
    for (const u of ['ada', 'bayo']) await t.api('/api/communities/join', { as: u, body: { code: c.inviteCode } })
    const members = (await t.api(`/api/communities/${c.id}/members`, { as: 'owner' })).body.members as { id: number; displayName: string; role: string }[]
    const id = (n: string) => members.find((m) => m.displayName === n)!.id
    return { c, id }
  }

  test('lists members without exposing email addresses', async () => {
    const { c } = await withMembers()
    const r = await t.api(`/api/communities/${c.id}/members`, { as: 'ada' })
    expect(r.body.members.map((m: { role: string }) => m.role)).toEqual(['owner', 'member', 'member'])
    expect(JSON.stringify(r.body)).not.toContain('@')
  })

  test('only owners promote, only admins remove, nobody removes the owner', async () => {
    const { c, id } = await withMembers()
    expect((await t.api(`/api/communities/${c.id}/members/${id('bayo')}`, { as: 'ada', method: 'PATCH', body: { role: 'admin' } })).status).toBe(403)
    expect((await t.api(`/api/communities/${c.id}/members/${id('ada')}`, { as: 'owner', method: 'PATCH', body: { role: 'admin' } })).status).toBe(204)
    expect((await t.api(`/api/communities/${c.id}`, { as: 'ada' })).body.community.inviteCode).toBeTruthy()
    expect((await t.api(`/api/communities/${c.id}/members/${id('owner')}`, { as: 'ada', method: 'DELETE' })).status).toBe(403)
    expect((await t.api(`/api/communities/${c.id}/members/${id('bayo')}`, { as: 'ada', method: 'DELETE' })).status).toBe(204)
    expect((await t.api(`/api/communities/${c.id}`, { as: 'bayo' })).status).toBe(404)
  })

  test('members can leave; owners cannot, and non-admins cannot remove others', async () => {
    const { c, id } = await withMembers()
    expect((await t.api(`/api/communities/${c.id}/members/${id('ada')}`, { as: 'bayo', method: 'DELETE' })).status).toBe(403)
    expect((await t.api(`/api/communities/${c.id}/members/${id('bayo')}`, { as: 'bayo', method: 'DELETE' })).status).toBe(204)
    const own = await t.api(`/api/communities/${c.id}/members/${id('owner')}`, { as: 'owner', method: 'DELETE' })
    expect(own.status).toBe(409)
    expect(own.body.error.code).toBe('owner_cannot_leave')
  })

  test('regenerating the code invalidates the old one; only the owner can delete', async () => {
    const { c } = await withMembers()
    expect((await t.api(`/api/communities/${c.id}/invite-code`, { as: 'ada', method: 'POST', body: {} })).status).toBe(403)
    const fresh = (await t.api(`/api/communities/${c.id}/invite-code`, { as: 'owner', method: 'POST', body: {} })).body.inviteCode
    expect(fresh).not.toBe(c.inviteCode)
    expect((await t.api('/api/communities/join', { as: 'late', body: { code: c.inviteCode } })).status).toBe(404)
    expect((await t.api('/api/communities/join', { as: 'late', body: { code: fresh } })).status).toBe(200)
    expect((await t.api(`/api/communities/${c.id}`, { as: 'ada', method: 'DELETE' })).status).toBe(403)
    expect((await t.api(`/api/communities/${c.id}`, { as: 'owner', method: 'DELETE' })).status).toBe(204)
    expect((await t.api(`/api/communities/${c.id}`, { as: 'ada' })).status).toBe(404)
  })
})

describe('private feed', () => {
  test('alerts notify other members and push; plain messages do not interrupt anyone', async () => {
    const c = await family()
    await t.api('/api/communities/join', { as: 'ada', body: { code: c.inviteCode } })
    const msg = await t.api(`/api/communities/${c.id}/posts`, { as: 'owner', body: { body: 'Dinner at 7?' } })
    expect(msg.status).toBe(201)
    expect((await t.api('/api/notifications', { as: 'ada' })).body.unread).toBe(0)
    await t.api(`/api/communities/${c.id}/posts`, { as: 'owner', body: { kind: 'alert', body: 'Roadblock at the junction', latitude: 6.5, longitude: 3.4 } })
    const n = (await t.api('/api/notifications', { as: 'ada' })).body.notifications[0]
    expect(n).toMatchObject({ type: 'community_post' })
    expect(n.title).toContain('Okafor Family')
    expect(t.realtime.pushes.at(-1)?.userIds).toHaveLength(1)
    const posts = (await t.api(`/api/communities/${c.id}/posts`, { as: 'ada' })).body.posts
    expect(posts[0]).toMatchObject({ kind: 'alert', latitude: 6.5, mine: false })
    expect(posts[1]).toMatchObject({ kind: 'message', latitude: null, mine: false })
  })

  test('validates posts and blocks outsiders', async () => {
    const c = await family()
    expect((await t.api(`/api/communities/${c.id}/posts`, { as: 'owner', body: { body: 'x' } })).status).toBe(400)
    expect((await t.api(`/api/communities/${c.id}/posts`, { as: 'owner', body: { body: 'Half a location', latitude: 6.5 } })).status).toBe(400)
    expect((await t.api(`/api/communities/${c.id}/posts`, { as: 'stranger', body: { body: 'Let me in please' } })).status).toBe(404)
  })
})
