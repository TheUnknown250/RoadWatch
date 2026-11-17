import { withTx } from '../db/pool'
import { bestEffort, type Ctx } from './context'

export interface AdvisoryDto {
  id: number
  title: string
  body: string
  severity: 'info' | 'warning' | 'critical'
  state: string | null
  createdAt: string
  expiresAt: string
}

interface Row {
  id: string
  title: string
  body: string
  severity: AdvisoryDto['severity']
  state: string | null
  created_at: Date
  expires_at: Date
}

const toDto = (r: Row): AdvisoryDto => ({
  id: Number(r.id), title: r.title, body: r.body, severity: r.severity, state: r.state,
  createdAt: r.created_at.toISOString(), expiresAt: r.expires_at.toISOString(),
})

export async function activeAdvisories(ctx: Ctx): Promise<AdvisoryDto[]> {
  const { rows } = await ctx.db.query<Row>(
    `SELECT id, title, body, severity, state, created_at, expires_at FROM advisories
      WHERE expires_at > now() ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, created_at DESC LIMIT 20`,
  )
  return rows.map(toDto)
}

export async function createAdvisory(
  ctx: Ctx,
  adminId: number,
  input: { title: string; body: string; severity: AdvisoryDto['severity']; state?: string; expiresInHours: number; notify: boolean },
): Promise<AdvisoryDto> {
  const out = await withTx(ctx.db, async (client) => {
    const ins = await client.query<Row>(
      `INSERT INTO advisories (title, body, severity, state, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, now() + make_interval(hours => $6))
       RETURNING id, title, body, severity, state, created_at, expires_at`,
      [input.title, input.body, input.severity, input.state ?? null, adminId, input.expiresInHours],
    )
    let recipients: number[] = []
    if (input.notify) {
      // Everyone who has not been suspended. Notifications are plain rows; push is sent after commit.
      const n = await client.query<{ user_id: string }>(
        `INSERT INTO notifications (user_id, type, title, body)
         SELECT id, 'advisory', $1::text, $2::text FROM users WHERE NOT is_banned RETURNING user_id`,
        [`Advisory: ${input.title}`, input.body.slice(0, 200)],
      )
      recipients = n.rows.map((r) => Number(r.user_id))
    }
    return { row: ins.rows[0], recipients }
  })
  if (out.recipients.length) {
    await bestEffort('push', () => ctx.realtime.push(out.recipients, { title: `Advisory: ${input.title}`, body: input.body.slice(0, 200) }))
  }
  return toDto(out.row)
}

export async function removeAdvisory(ctx: Ctx, id: number): Promise<boolean> {
  const del = await ctx.db.query('UPDATE advisories SET expires_at = now() WHERE id = $1 AND expires_at > now()', [id])
  return (del.rowCount ?? 0) > 0
}
