import { withTx } from '../db/pool'
import { conflict, notFound } from '../errors'
import { bestEffort, type Ctx } from './context'
import { distanceM } from './trips'

export type SessionKind = 'sos' | 'trip'
export type SessionStatus = 'active' | 'overdue' | 'ended'

/** A trip counts as arrived when the live position is this close to the destination. */
export const ARRIVAL_RADIUS_M = 150

export interface SessionDto {
  id: number
  kind: SessionKind
  status: SessionStatus
  outcome: string | null
  message: string | null
  owner: { id: number; displayName: string }
  destination: { lat: number; lng: number; label: string | null } | null
  expectedArrival: string | null
  graceMinutes: number
  lastLocation: { lat: number; lng: number } | null
  lastSeen: string
  startedAt: string
  endedAt: string | null
  communities: { id: number; name: string }[]
  mine: boolean
}

interface Row {
  id: string
  kind: SessionKind
  status: SessionStatus
  outcome: string | null
  message: string | null
  user_id: string
  display_name: string
  dest_lat: number | null
  dest_lng: number | null
  destination_label: string | null
  expected_arrival: Date | null
  grace_minutes: number
  loc_lat: number | null
  loc_lng: number | null
  last_seen: Date
  started_at: Date
  ended_at: Date | null
  communities: { id: string; name: string }[] | null
}

const SELECT = `
  SELECT s.id, s.kind, s.status, s.outcome, s.message, s.user_id, u.display_name,
         ST_Y(s.destination::geometry) AS dest_lat, ST_X(s.destination::geometry) AS dest_lng, s.destination_label,
         s.expected_arrival, s.grace_minutes, ST_Y(s.last_location::geometry) AS loc_lat, ST_X(s.last_location::geometry) AS loc_lng,
         s.last_seen, s.started_at, s.ended_at,
         (SELECT json_agg(json_build_object('id', c.id, 'name', c.name)) FROM safety_session_shares sh JOIN communities c ON c.id = sh.community_id WHERE sh.session_id = s.id) AS communities
    FROM safety_sessions s JOIN users u ON u.id = s.user_id`

const toDto = (r: Row, viewerId: number): SessionDto => ({
  id: Number(r.id), kind: r.kind, status: r.status, outcome: r.outcome, message: r.message,
  owner: { id: Number(r.user_id), displayName: r.display_name },
  destination: r.dest_lat !== null && r.dest_lng !== null ? { lat: r.dest_lat, lng: r.dest_lng, label: r.destination_label } : null,
  expectedArrival: r.expected_arrival?.toISOString() ?? null, graceMinutes: r.grace_minutes,
  lastLocation: r.loc_lat !== null && r.loc_lng !== null ? { lat: r.loc_lat, lng: r.loc_lng } : null,
  lastSeen: r.last_seen.toISOString(), startedAt: r.started_at.toISOString(), endedAt: r.ended_at?.toISOString() ?? null,
  communities: (r.communities ?? []).map((c) => ({ id: Number(c.id), name: c.name })), mine: Number(r.user_id) === viewerId,
})

const point = (a: string, b: string) => `ST_SetSRID(ST_MakePoint(${a}, ${b}), 4326)::geography`

/** Notify everyone who can see a session (members of its shared communities), except its owner. */
async function notifyWatchers(
  ctx: Ctx,
  sessionId: number,
  ownerId: number,
  type: 'sos' | 'trip_started' | 'trip_overdue' | 'trip_arrived',
  title: string,
  body: string,
): Promise<number[]> {
  const { rows } = await ctx.db.query<{ user_id: string }>(
    `INSERT INTO notifications (user_id, type, title, body)
     SELECT DISTINCT m.user_id, $2::text, $3::text, $4::text
       FROM safety_session_shares sh JOIN community_members m ON m.community_id = sh.community_id
      WHERE sh.session_id = $1 AND m.user_id <> $5
     RETURNING user_id`,
    [sessionId, type, title, body, ownerId],
  )
  const ids = rows.map((r) => Number(r.user_id))
  await bestEffort('push', () => ctx.realtime.push(ids, { title, body }))
  return ids
}

async function shareWith(client: { query: (sql: string, p: unknown[]) => Promise<unknown> }, sessionId: number, userId: number, communityIds: number[] | 'all') {
  if (communityIds === 'all') {
    await client.query(
      'INSERT INTO safety_session_shares (session_id, community_id) SELECT $1, community_id FROM community_members WHERE user_id = $2',
      [sessionId, userId],
    )
  } else if (communityIds.length) {
    await client.query(
      'INSERT INTO safety_session_shares (session_id, community_id) SELECT $1, community_id FROM community_members WHERE user_id = $2 AND community_id = ANY($3)',
      [sessionId, userId, communityIds],
    )
  }
}

async function load(ctx: Ctx, id: number, viewerId: number): Promise<SessionDto> {
  const { rows } = await ctx.db.query<Row>(`${SELECT} WHERE s.id = $1`, [id])
  if (!rows[0]) throw notFound('Session not found')
  return toDto(rows[0], viewerId)
}

export async function startSos(
  ctx: Ctx,
  user: { id: number; displayName: string },
  input: { latitude: number; longitude: number; message?: string },
  shareWithCommunities: boolean,
): Promise<{ session: SessionDto; notified: number; existing: boolean }> {
  const result = await withTx(ctx.db, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [user.id])
    const open = await client.query<{ id: string }>("SELECT id FROM safety_sessions WHERE user_id = $1 AND kind = 'sos' AND status <> 'ended'", [user.id])
    if (open.rows[0]) return { id: Number(open.rows[0].id), existing: true }
    const ins = await client.query<{ id: string }>(
      `INSERT INTO safety_sessions (user_id, kind, message, last_location) VALUES ($1, 'sos', $2, ${point('$4', '$3')}) RETURNING id`,
      [user.id, input.message ?? null, input.latitude, input.longitude],
    )
    if (shareWithCommunities) await shareWith(client, Number(ins.rows[0].id), user.id, 'all')
    return { id: Number(ins.rows[0].id), existing: false }
  })
  let notified = 0
  if (!result.existing) {
    notified = (
      await notifyWatchers(ctx, result.id, user.id, 'sos', `SOS from ${user.displayName}`, input.message ? input.message.slice(0, 140) : 'They need help. Open to see their location.')
    ).length
  }
  return { session: await load(ctx, result.id, user.id), notified, existing: result.existing }
}

export async function startTrip(
  ctx: Ctx,
  user: { id: number; displayName: string },
  input: {
    latitude: number
    longitude: number
    destination: { lat: number; lng: number }
    destinationLabel?: string
    expectedArrivalAt: Date
    graceMinutes: number
    communityIds: number[]
  },
): Promise<SessionDto> {
  const id = await withTx(ctx.db, async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [user.id])
    const open = await client.query("SELECT 1 FROM safety_sessions WHERE user_id = $1 AND kind = 'trip' AND status <> 'ended'", [user.id])
    if (open.rows[0]) throw conflict('trip_in_progress', 'Finish or cancel your current trip first')
    const ins = await client.query<{ id: string }>(
      `INSERT INTO safety_sessions (user_id, kind, destination, destination_label, expected_arrival, grace_minutes, last_location)
       VALUES ($1, 'trip', ${point('$3', '$2')}, $4, $5, $6, ${point('$8', '$7')}) RETURNING id`,
      [user.id, input.destination.lat, input.destination.lng, input.destinationLabel ?? null, input.expectedArrivalAt, input.graceMinutes, input.latitude, input.longitude],
    )
    await shareWith(client, Number(ins.rows[0].id), user.id, input.communityIds)
    return Number(ins.rows[0].id)
  })
  await notifyWatchers(ctx, id, user.id, 'trip_started', `${user.displayName} started a trip`, `Heading to ${input.destinationLabel ?? 'their destination'}. You will be told if they do not arrive.`)
  return load(ctx, id, user.id)
}

/** Records the latest position. Trips end themselves on arrival. */
export async function updateLocation(ctx: Ctx, user: { id: number; displayName: string }, id: number, lat: number, lng: number): Promise<SessionDto> {
  const { rows } = await ctx.db.query<{ kind: SessionKind; status: SessionStatus; user_id: string; dest_lat: number | null; dest_lng: number | null; label: string | null }>(
    `SELECT kind, status, user_id, ST_Y(destination::geometry) AS dest_lat, ST_X(destination::geometry) AS dest_lng, destination_label AS label FROM safety_sessions WHERE id = $1`,
    [id],
  )
  const s = rows[0]
  if (!s || Number(s.user_id) !== user.id) throw notFound('Session not found')
  if (s.status === 'ended') throw conflict('session_ended', 'This session has ended')
  await ctx.db.query(`UPDATE safety_sessions SET last_location = ${point('$3', '$2')}, last_seen = now() WHERE id = $1`, [id, lat, lng])
  if (s.kind === 'trip' && s.dest_lat !== null && s.dest_lng !== null && distanceM({ lat, lng }, { lat: s.dest_lat, lng: s.dest_lng }) <= ARRIVAL_RADIUS_M) {
    return endSession(ctx, user, id, 'arrived')
  }
  return load(ctx, id, user.id)
}

export async function endSession(ctx: Ctx, user: { id: number; displayName: string }, id: number, outcome: 'arrived' | 'safe' | 'cancelled'): Promise<SessionDto> {
  const { rows } = await ctx.db.query<{ kind: SessionKind; status: SessionStatus; user_id: string; label: string | null }>(
    'SELECT kind, status, user_id, destination_label AS label FROM safety_sessions WHERE id = $1',
    [id],
  )
  const s = rows[0]
  if (!s || Number(s.user_id) !== user.id) throw notFound('Session not found')
  if (s.status === 'ended') return load(ctx, id, user.id)
  if (outcome === 'arrived' && s.kind !== 'trip') throw conflict('bad_outcome', 'Only trips can be marked arrived')
  if (outcome === 'safe' && s.kind !== 'sos') throw conflict('bad_outcome', 'Only SOS alerts can be marked safe')
  // The final location is deleted: it is not needed once the person is safe.
  await ctx.db.query("UPDATE safety_sessions SET status = 'ended', outcome = $2, ended_at = now(), last_location = NULL WHERE id = $1", [id, outcome])
  if (outcome === 'safe') await notifyWatchers(ctx, id, user.id, 'sos', `${user.displayName} is safe`, 'They ended their SOS alert and marked themselves safe.')
  if (outcome === 'arrived') await notifyWatchers(ctx, id, user.id, 'trip_arrived', `${user.displayName} arrived safely`, s.label ? `They reached ${s.label}.` : 'They reached their destination.')
  if (outcome === 'cancelled' && s.kind === 'trip') await notifyWatchers(ctx, id, user.id, 'trip_arrived', `${user.displayName} ended their trip`, 'They cancelled trip sharing.')
  if (outcome === 'cancelled' && s.kind === 'sos') await notifyWatchers(ctx, id, user.id, 'sos', `${user.displayName} cancelled their SOS`, 'It was marked as a false alarm.')
  return load(ctx, id, user.id)
}

export async function mySessions(ctx: Ctx, userId: number): Promise<SessionDto[]> {
  const { rows } = await ctx.db.query<Row>(`${SELECT} WHERE s.user_id = $1 AND s.status <> 'ended' ORDER BY s.started_at DESC`, [userId])
  return rows.map((r) => toDto(r, userId))
}

export async function sharedWithMe(ctx: Ctx, userId: number): Promise<SessionDto[]> {
  const { rows } = await ctx.db.query<Row>(
    `${SELECT} WHERE s.status <> 'ended' AND s.user_id <> $1 AND EXISTS (
        SELECT 1 FROM safety_session_shares sh JOIN community_members m ON m.community_id = sh.community_id
         WHERE sh.session_id = s.id AND m.user_id = $1)
      ORDER BY (s.kind = 'sos') DESC, s.started_at DESC`,
    [userId],
  )
  return rows.map((r) => toDto(r, userId))
}

export async function getSession(ctx: Ctx, userId: number, id: number): Promise<SessionDto> {
  const s = await load(ctx, id, userId)
  if (s.mine) return s
  const { rows } = await ctx.db.query(
    `SELECT 1 FROM safety_session_shares sh JOIN community_members m ON m.community_id = sh.community_id WHERE sh.session_id = $1 AND m.user_id = $2 LIMIT 1`,
    [id, userId],
  )
  if (!rows[0]) throw notFound('Session not found')
  return s
}

/** Marks overdue trips and warns the people watching. Runs every minute from the server. */
export async function sweepOverdueTrips(ctx: Ctx): Promise<number> {
  const { rows } = await ctx.db.query<{ id: string; user_id: string; display_name: string; label: string | null }>(
    `UPDATE safety_sessions s SET status = 'overdue'
       FROM users u
      WHERE u.id = s.user_id AND s.kind = 'trip' AND s.status = 'active'
        AND s.expected_arrival + make_interval(mins => s.grace_minutes) <= now()
      RETURNING s.id, s.user_id, u.display_name, s.destination_label AS label`,
  )
  for (const r of rows) {
    await notifyWatchers(
      ctx, Number(r.id), Number(r.user_id), 'trip_overdue', `${r.display_name} has not arrived`,
      `They were due${r.label ? ` at ${r.label}` : ''} and have not checked in. Try calling them.`,
    )
  }
  return rows.length
}
