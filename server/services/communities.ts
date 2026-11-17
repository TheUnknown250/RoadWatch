import { randomBytes } from 'node:crypto'
import { withTx } from '../db/pool'
import { conflict, forbidden, notFound } from '../errors'
import { bestEffort, type Ctx } from './context'

export type CommunityRole = 'owner' | 'admin' | 'member'

// No 0/O/1/I so codes survive being read aloud or typed from a screenshot.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function newInviteCode(): string {
  const bytes = randomBytes(8)
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}

export interface CommunityDto {
  id: number
  name: string
  type: string
  description: string | null
  memberCount: number
  myRole: CommunityRole
  /** Only visible to owners and admins. */
  inviteCode: string | null
  createdAt: string
}

interface Row {
  id: string
  name: string
  type: string
  description: string | null
  invite_code: string
  created_at: Date
  member_count: number
  role: CommunityRole
}

const SELECT = `
  SELECT c.id, c.name, c.type, c.description, c.invite_code, c.created_at, m.role,
         (SELECT count(*)::int FROM community_members x WHERE x.community_id = c.id) AS member_count
    FROM communities c JOIN community_members m ON m.community_id = c.id AND m.user_id = $1`

const toDto = (r: Row): CommunityDto => ({
  id: Number(r.id), name: r.name, type: r.type, description: r.description, memberCount: r.member_count, myRole: r.role,
  inviteCode: r.role === 'member' ? null : r.invite_code, createdAt: r.created_at.toISOString(),
})

const MAX_OWNED = 10
const MAX_JOINED = 25

export async function myCommunities(ctx: Ctx, userId: number): Promise<CommunityDto[]> {
  const { rows } = await ctx.db.query<Row>(`${SELECT} ORDER BY c.created_at DESC`, [userId])
  return rows.map(toDto)
}

export async function getCommunity(ctx: Ctx, userId: number, id: number): Promise<CommunityDto> {
  const { rows } = await ctx.db.query<Row>(`${SELECT} WHERE c.id = $2`, [userId, id])
  // Non-members get the same answer as for a community that does not exist.
  if (!rows[0]) throw notFound('Community not found')
  return toDto(rows[0])
}

export async function createCommunity(
  ctx: Ctx,
  userId: number,
  input: { name: string; type: string; description?: string },
): Promise<CommunityDto> {
  const id = await withTx(ctx.db, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [userId])
    const owned = await client.query('SELECT count(*)::int AS n FROM communities WHERE created_by = $1', [userId])
    if (owned.rows[0].n >= MAX_OWNED) throw conflict('limit_reached', `You can create up to ${MAX_OWNED} communities`)
    const ins = await client.query<{ id: string }>(
      'INSERT INTO communities (name, type, description, invite_code, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [input.name, input.type, input.description ?? null, newInviteCode(), userId],
    )
    await client.query("INSERT INTO community_members (community_id, user_id, role) VALUES ($1, $2, 'owner')", [ins.rows[0].id, userId])
    return Number(ins.rows[0].id)
  })
  return getCommunity(ctx, userId, id)
}

export async function joinByCode(ctx: Ctx, userId: number, code: string): Promise<CommunityDto> {
  const found = await ctx.db.query<{ id: string; name: string; created_by: string }>(
    'SELECT id, name, created_by FROM communities WHERE invite_code = $1',
    [code.toUpperCase()],
  )
  const c = found.rows[0]
  if (!c) throw notFound('That invite code is not valid')
  const joined = await ctx.db.query('SELECT count(*)::int AS n FROM community_members WHERE user_id = $1', [userId])
  if (joined.rows[0].n >= MAX_JOINED) throw conflict('limit_reached', `You can belong to up to ${MAX_JOINED} communities`)
  const ins = await ctx.db.query(
    'INSERT INTO community_members (community_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING user_id',
    [c.id, userId],
  )
  if (!ins.rowCount) throw conflict('already_member', 'You are already in this community')

  const who = await ctx.db.query<{ display_name: string }>('SELECT display_name FROM users WHERE id = $1', [userId])
  const title = `New member in ${c.name}`
  const body = `${who.rows[0].display_name} joined.`
  await ctx.db.query(
    `INSERT INTO notifications (user_id, type, title, body)
     SELECT user_id, 'community_joined', $2::text, $3::text FROM community_members
      WHERE community_id = $1 AND role IN ('owner', 'admin') AND user_id <> $4`,
    [c.id, title, body, userId],
  )
  return getCommunity(ctx, userId, Number(c.id))
}

async function roleOf(ctx: Ctx, userId: number, communityId: number): Promise<CommunityRole | null> {
  const { rows } = await ctx.db.query<{ role: CommunityRole }>('SELECT role FROM community_members WHERE community_id = $1 AND user_id = $2', [communityId, userId])
  return rows[0]?.role ?? null
}

export async function requireMember(ctx: Ctx, userId: number, communityId: number): Promise<CommunityRole> {
  const role = await roleOf(ctx, userId, communityId)
  if (!role) throw notFound('Community not found')
  return role
}

async function requireAdmin(ctx: Ctx, userId: number, communityId: number): Promise<CommunityRole> {
  const role = await requireMember(ctx, userId, communityId)
  if (role === 'member') throw forbidden('Only community admins can do this')
  return role
}

export async function listMembers(ctx: Ctx, userId: number, communityId: number) {
  await requireMember(ctx, userId, communityId)
  const { rows } = await ctx.db.query(
    `SELECT u.id, u.display_name, m.role, m.joined_at FROM community_members m JOIN users u ON u.id = m.user_id
      WHERE m.community_id = $1 ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, m.joined_at`,
    [communityId],
  )
  return rows.map((r) => ({ id: Number(r.id), displayName: r.display_name as string, role: r.role as CommunityRole, joinedAt: (r.joined_at as Date).toISOString() }))
}

export async function removeMember(ctx: Ctx, actorId: number, communityId: number, targetId: number): Promise<void> {
  if (actorId === targetId) {
    const role = await requireMember(ctx, actorId, communityId)
    if (role === 'owner') throw conflict('owner_cannot_leave', 'Owners cannot leave. Delete the community instead.')
  } else {
    const actor = await requireAdmin(ctx, actorId, communityId)
    const target = await roleOf(ctx, targetId, communityId)
    if (!target) throw notFound('Member not found')
    if (target === 'owner' || (target === 'admin' && actor !== 'owner')) throw forbidden('You cannot remove this member')
  }
  await ctx.db.query('DELETE FROM community_members WHERE community_id = $1 AND user_id = $2', [communityId, targetId])
}

export async function setRole(ctx: Ctx, actorId: number, communityId: number, targetId: number, role: 'admin' | 'member'): Promise<void> {
  const actor = await requireMember(ctx, actorId, communityId)
  if (actor !== 'owner') throw forbidden('Only the owner can change roles')
  const target = await roleOf(ctx, targetId, communityId)
  if (!target || target === 'owner') throw notFound('Member not found')
  await ctx.db.query('UPDATE community_members SET role = $3 WHERE community_id = $1 AND user_id = $2', [communityId, targetId, role])
}

export async function regenerateCode(ctx: Ctx, userId: number, communityId: number): Promise<string> {
  await requireAdmin(ctx, userId, communityId)
  const code = newInviteCode()
  await ctx.db.query('UPDATE communities SET invite_code = $2 WHERE id = $1', [communityId, code])
  return code
}

export async function deleteCommunity(ctx: Ctx, userId: number, communityId: number): Promise<void> {
  const role = await requireMember(ctx, userId, communityId)
  if (role !== 'owner') throw forbidden('Only the owner can delete a community')
  await ctx.db.query('DELETE FROM communities WHERE id = $1', [communityId])
}

export async function listPosts(ctx: Ctx, userId: number, communityId: number) {
  await requireMember(ctx, userId, communityId)
  const { rows } = await ctx.db.query(
    `SELECT p.id, p.kind, p.body, p.created_at, u.id AS user_id, u.display_name,
            ST_Y(p.location::geometry) AS lat, ST_X(p.location::geometry) AS lng
       FROM community_posts p JOIN users u ON u.id = p.user_id WHERE p.community_id = $1 ORDER BY p.created_at DESC, p.id DESC LIMIT 100`,
    [communityId],
  )
  return rows.map((r) => ({
    id: Number(r.id), kind: r.kind as 'alert' | 'message', body: r.body as string, createdAt: (r.created_at as Date).toISOString(),
    author: { id: Number(r.user_id), displayName: r.display_name as string }, mine: Number(r.user_id) === userId,
    latitude: (r.lat as number | null) ?? null, longitude: (r.lng as number | null) ?? null,
  }))
}

export async function addPost(
  ctx: Ctx,
  userId: number,
  communityId: number,
  input: { kind: 'alert' | 'message'; body: string; latitude?: number; longitude?: number },
) {
  await requireMember(ctx, userId, communityId)
  const hasPoint = input.latitude !== undefined && input.longitude !== undefined
  await ctx.db.query(
    `INSERT INTO community_posts (community_id, user_id, kind, body, location)
     VALUES ($1, $2, $3, $4, ${hasPoint ? 'ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography' : 'NULL'})`,
    hasPoint ? [communityId, userId, input.kind, input.body, input.longitude, input.latitude] : [communityId, userId, input.kind, input.body],
  )
  // Only alerts interrupt people; ordinary messages wait in the feed.
  if (input.kind !== 'alert') return
  const info = await ctx.db.query<{ name: string; display_name: string }>(
    'SELECT c.name, u.display_name FROM communities c, users u WHERE c.id = $1 AND u.id = $2',
    [communityId, userId],
  )
  const title = `${input.kind === 'alert' ? 'Alert' : 'Message'} in ${info.rows[0].name}`
  const body = `${info.rows[0].display_name}: ${input.body.slice(0, 140)}`
  const notified = await ctx.db.query<{ user_id: string }>(
    `INSERT INTO notifications (user_id, type, title, body)
     SELECT user_id, 'community_post', $2::text, $3::text FROM community_members WHERE community_id = $1 AND user_id <> $4 RETURNING user_id`,
    [communityId, title, body, userId],
  )
  await bestEffort('push', () => ctx.realtime.push(notified.rows.map((n) => Number(n.user_id)), { title, body }))
}
