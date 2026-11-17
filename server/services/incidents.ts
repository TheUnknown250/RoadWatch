import { withTx } from '../db/pool'
import { badRequest, conflict, forbidden, notFound } from '../errors'
import { bestEffort, type Ctx, type IncidentEvent } from './context'
import { getIncident, type IncidentDto, type Viewer } from './incidentQuery'
import { applyTransition, isVotable, nextStatus, type Status } from './status'

export interface NewIncident {
  categorySlug: string
  title: string
  description: string
  latitude: number
  longitude: number
  addressText?: string
  state?: string
  occurredAt: Date
  idempotencyKey: string
  isAnonymous: boolean
}

const DUPLICATE_RADIUS_M = 150
const DUPLICATE_WINDOW_MIN = 15

interface Snapshot {
  id: string
  status: Status
  confirm_count: number
  flag_count: number
  updated_at: Date
}

const toEvent = (s: Snapshot, kind: IncidentEvent['kind']): IncidentEvent => ({
  id: Number(s.id),
  kind,
  status: s.status,
  confirmCount: s.confirm_count,
  flagCount: s.flag_count,
  updatedAt: s.updated_at.toISOString(),
})

async function publish(ctx: Ctx, event: IncidentEvent, notifiedUserIds: number[], push?: { title: string; body: string }) {
  await bestEffort('realtime mirror', () => ctx.realtime.incidentChanged(event))
  if (push && notifiedUserIds.length) {
    await bestEffort('push', () => ctx.realtime.push(notifiedUserIds, { ...push, incidentId: event.id }))
  }
}

export async function createIncident(ctx: Ctx, reporterId: number, input: NewIncident): Promise<{ incident: IncidentDto; replayed: boolean }> {
  const result = await withTx(ctx.db, async (client) => {
    const cat = await client.query<{ id: number; expiry_hours: number; name: string }>(
      'SELECT id, expiry_hours, name FROM categories WHERE slug = $1',
      [input.categorySlug],
    )
    if (!cat.rows[0]) throw badRequest('Unknown category')

    // Serialise this reporter's submissions so retries and double-taps cannot race each other.
    await client.query('SELECT pg_advisory_xact_lock($1)', [reporterId])

    const existing = await client.query<{ id: string }>(
      'SELECT id FROM incidents WHERE reporter_id = $1 AND idempotency_key = $2',
      [reporterId, input.idempotencyKey],
    )
    if (existing.rows[0]) return { id: Number(existing.rows[0].id), replayed: true, push: [] as number[], snapshot: null }

    const point = 'ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography'
    const dup = await client.query(
      `SELECT 1 FROM incidents
        WHERE reporter_id = $3 AND category_id = $4
          AND created_at > now() - make_interval(mins => $5)
          AND ST_DWithin(location, ${point}, $6) LIMIT 1`,
      [input.longitude, input.latitude, reporterId, cat.rows[0].id, DUPLICATE_WINDOW_MIN, DUPLICATE_RADIUS_M],
    )
    if (dup.rows[0]) throw conflict('duplicate_report', 'You already reported this type of incident at this spot a moment ago')

    const ins = await client.query<Snapshot>(
      `INSERT INTO incidents (reporter_id, category_id, title, description, location, address_text, state,
                              occurred_at, idempotency_key, expires_at, is_anonymous)
       VALUES ($3, $4, $5, $6, ${point}, $7, $8, $9, $10, now() + make_interval(hours => $11), $12)
       RETURNING id, status, confirm_count, flag_count, updated_at`,
      [
        input.longitude, input.latitude, reporterId, cat.rows[0].id, input.title, input.description,
        input.addressText ?? null, input.state ?? null, input.occurredAt, input.idempotencyKey, cat.rows[0].expiry_hours, input.isAnonymous,
      ],
    )
    const row = ins.rows[0]
    await client.query(
      `INSERT INTO incident_status_history (incident_id, from_status, to_status, changed_by, reason)
       VALUES ($1, NULL, 'pending', $2, 'Report submitted')`,
      [row.id, reporterId],
    )
    // Notify users whose saved area (and category choice) covers this incident.
    const notified = await client.query<{ user_id: string }>(
      `INSERT INTO notifications (user_id, incident_id, type, title, body)
       SELECT DISTINCT s.user_id, $1::bigint, 'nearby_incident', $2::text, $3::text
         FROM area_subscriptions s
        WHERE s.user_id <> $4
          AND ST_DWithin(s.center, ${'ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography'}, s.radius_m)
          AND (cardinality(s.category_ids) = 0 OR $7 = ANY(s.category_ids))
       RETURNING user_id`,
      [row.id, `New report: ${cat.rows[0].name}`, input.title, reporterId, input.longitude, input.latitude, cat.rows[0].id],
    )
    return { id: Number(row.id), replayed: false, push: notified.rows.map((n) => Number(n.user_id)), snapshot: row }
  })

  if (result.snapshot) {
    await publish(ctx, toEvent(result.snapshot, 'created'), result.push, { title: 'New incident near you', body: input.title })
  }
  const incident = await getIncident(ctx.db, result.id, { id: reporterId, role: 'user' })
  if (!incident) throw notFound()
  return { incident, replayed: result.replayed }
}

export async function voteOnIncident(
  ctx: Ctx,
  userId: number,
  incidentId: number,
  vote: 'confirm' | 'flag',
  reason?: string,
): Promise<IncidentDto> {
  const out = await withTx(ctx.db, async (client) => {
    const locked = await client.query<{ reporter_id: string; status: Status; moderated: boolean; expires_at: Date }>(
      'SELECT reporter_id, status, moderated, expires_at FROM incidents WHERE id = $1 FOR UPDATE',
      [incidentId],
    )
    const inc = locked.rows[0]
    if (!inc || inc.status === 'rejected' || inc.status === 'withdrawn') throw notFound('Incident not found')
    if (Number(inc.reporter_id) === userId) throw forbidden('You cannot verify your own report')
    if (!isVotable(inc.status) || inc.expires_at <= new Date()) {
      throw conflict('voting_closed', 'Voting is closed for this incident')
    }

    const inserted = await client.query(
      `INSERT INTO verifications (incident_id, user_id, vote, reason) VALUES ($1, $2, $3, $4)
       ON CONFLICT (incident_id, user_id) DO NOTHING RETURNING id`,
      [incidentId, userId, vote, reason ?? null],
    )
    if (!inserted.rows[0]) throw conflict('already_voted', 'You have already voted on this incident')

    const counts = await client.query<{ confirm_count: number; flag_count: number }>(
      `UPDATE incidents SET
         confirm_count = confirm_count + CASE WHEN $2::text = 'confirm' THEN 1 ELSE 0 END,
         flag_count = flag_count + CASE WHEN $2::text = 'flag' THEN 1 ELSE 0 END,
         updated_at = now()
       WHERE id = $1 RETURNING confirm_count, flag_count`,
      [incidentId, vote],
    )
    const { confirm_count, flag_count } = counts.rows[0]

    let notified: number[] = []
    let status: Status = inc.status
    if (!inc.moderated) {
      const next = nextStatus(inc.status, confirm_count, flag_count, ctx.config)
      if (next !== inc.status) {
        notified = await applyTransition(client, {
          incidentId, reporterId: Number(inc.reporter_id), from: inc.status, to: next, changedBy: null,
          reason: `Community vote: ${confirm_count} confirmed, ${flag_count} flagged`,
        })
        status = next
      }
    }
    return { event: { id: incidentId, kind: 'updated' as const, status, confirmCount: confirm_count, flagCount: flag_count, updatedAt: new Date().toISOString() }, notified, status }
  })

  await publish(ctx, out.event, out.notified, { title: 'Your report was updated', body: `Status: ${out.status}` })
  const incident = await getIncident(ctx.db, incidentId, { id: userId, role: 'user' })
  if (!incident) throw notFound()
  return incident
}

export async function moderateIncident(
  ctx: Ctx,
  moderatorId: number,
  incidentId: number,
  to: Status,
  reason: string,
): Promise<IncidentDto> {
  const out = await withTx(ctx.db, async (client) => {
    const locked = await client.query<{ reporter_id: string; status: Status; confirm_count: number; flag_count: number }>(
      'SELECT reporter_id, status, confirm_count, flag_count FROM incidents WHERE id = $1 FOR UPDATE',
      [incidentId],
    )
    const inc = locked.rows[0]
    if (!inc) throw notFound('Incident not found')
    if (inc.status === to) throw conflict('no_change', `Incident is already ${to}`)
    const notified = await applyTransition(client, {
      incidentId, reporterId: Number(inc.reporter_id), from: inc.status, to, changedBy: moderatorId, reason, moderated: true,
    })
    return {
      event: { id: incidentId, kind: 'updated' as const, status: to, confirmCount: inc.confirm_count, flagCount: inc.flag_count, updatedAt: new Date().toISOString() },
      notified,
    }
  })
  await publish(ctx, out.event, out.notified, { title: 'Your report was updated', body: `Status: ${to}` })
  const incident = await getIncident(ctx.db, incidentId, { id: moderatorId, role: 'admin' })
  if (!incident) throw notFound()
  return incident
}

/** Marks overdue open incidents as expired (system action, recorded in history). */
export async function expireStale(ctx: Ctx): Promise<number> {
  const events = await withTx(ctx.db, async (client) => {
    const stale = await client.query<{ id: string; reporter_id: string; status: Status; confirm_count: number; flag_count: number }>(
      `SELECT id, reporter_id, status, confirm_count, flag_count FROM incidents
        WHERE status IN ('pending', 'verified', 'disputed') AND expires_at <= now() FOR UPDATE SKIP LOCKED`,
    )
    const out: IncidentEvent[] = []
    for (const r of stale.rows) {
      await applyTransition(client, {
        incidentId: Number(r.id), reporterId: Number(r.reporter_id), from: r.status, to: 'expired',
        changedBy: null, reason: 'Expired automatically',
      })
      out.push({ id: Number(r.id), kind: 'updated', status: 'expired', confirmCount: r.confirm_count, flagCount: r.flag_count, updatedAt: new Date().toISOString() })
    }
    return out
  })
  for (const e of events) await bestEffort('realtime mirror', () => ctx.realtime.incidentChanged(e))
  return events.length
}

export async function statusHistory(ctx: Ctx, incidentId: number, viewer?: Viewer) {
  const { rows } = await ctx.db.query<{ from_status: string | null; to_status: string; reason: string | null; created_at: Date; by: string | null; changed_by: string | null; reporter_id: string; is_anonymous: boolean }>(
    `SELECT h.from_status, h.to_status, h.reason, h.created_at, u.display_name AS by, h.changed_by, i.reporter_id, i.is_anonymous
       FROM incident_status_history h JOIN incidents i ON i.id = h.incident_id LEFT JOIN users u ON u.id = h.changed_by
      WHERE h.incident_id = $1 ORDER BY h.created_at, h.id`,
    [incidentId],
  )
  const privileged = viewer && viewer.role !== 'user'
  return rows.map((r) => {
    // Do not reveal an anonymous reporter through the audit trail.
    const isReporter = r.changed_by !== null && r.changed_by === r.reporter_id
    const hide = r.is_anonymous && isReporter && !privileged && viewer?.id !== Number(r.reporter_id)
    return { from: r.from_status, to: r.to_status, reason: r.reason, at: r.created_at.toISOString(), by: hide ? 'Anonymous' : r.by }
  })
}

/** The reporter takes back their own report while it is still unverified. Kept for the audit trail, hidden from the public. */
export async function withdrawIncident(ctx: Ctx, userId: number, incidentId: number): Promise<IncidentDto> {
  const event = await withTx(ctx.db, async (client) => {
    const locked = await client.query<{ reporter_id: string; status: Status; confirm_count: number; flag_count: number }>(
      'SELECT reporter_id, status, confirm_count, flag_count FROM incidents WHERE id = $1 FOR UPDATE',
      [incidentId],
    )
    const inc = locked.rows[0]
    if (!inc || Number(inc.reporter_id) !== userId) throw notFound('Incident not found')
    if (inc.status !== 'pending') throw conflict('cannot_withdraw', 'Only reports that are still awaiting confirmation can be withdrawn')
    await applyTransition(client, {
      incidentId, reporterId: userId, from: inc.status, to: 'withdrawn', changedBy: userId, reason: 'Withdrawn by the reporter',
    })
    return { id: incidentId, kind: 'updated' as const, status: 'withdrawn', confirmCount: inc.confirm_count, flagCount: inc.flag_count, updatedAt: new Date().toISOString() }
  })
  await bestEffort('realtime mirror', () => ctx.realtime.incidentChanged(event))
  const incident = await getIncident(ctx.db, incidentId, { id: userId, role: 'user' })
  if (!incident) throw notFound()
  return incident
}
