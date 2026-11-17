import { conflict, forbidden, notFound } from '../errors'
import { bestEffort, type Ctx } from './context'
import { getIncident, type Viewer } from './incidentQuery'

export interface CommentDto {
  id: number
  body: string
  createdAt: string
  hidden: boolean
  mine: boolean
  author: { id: number; displayName: string; role: string }
}

interface Row {
  id: string
  body: string
  created_at: Date
  hidden: boolean
  user_id: string
  display_name: string
  role: string
}

const isMod = (v?: Viewer) => v?.role === 'moderator' || v?.role === 'admin'

const toDto = (r: Row, viewer?: Viewer, anonymousReporterId?: number): CommentDto => ({
  id: Number(r.id),
  body: r.body,
  createdAt: r.created_at.toISOString(),
  hidden: r.hidden,
  mine: Number(r.user_id) === viewer?.id,
  author:
    anonymousReporterId === Number(r.user_id) && !isMod(viewer)
      ? { id: 0, displayName: 'Anonymous reporter', role: 'user' }
      : { id: Number(r.user_id), displayName: r.display_name, role: r.role },
})

/** The reporter's id if the incident is anonymous, so their comments can be masked. */
async function anonymousReporter(ctx: Ctx, incidentId: number): Promise<number | undefined> {
  const { rows } = await ctx.db.query<{ reporter_id: string; is_anonymous: boolean }>('SELECT reporter_id, is_anonymous FROM incidents WHERE id = $1', [incidentId])
  return rows[0]?.is_anonymous ? Number(rows[0].reporter_id) : undefined
}

const SELECT = `SELECT c.id, c.body, c.created_at, c.hidden, c.user_id, u.display_name, u.role
                  FROM incident_comments c JOIN users u ON u.id = c.user_id`

export async function listComments(ctx: Ctx, incidentId: number, viewer?: Viewer): Promise<CommentDto[]> {
  if (!(await getIncident(ctx.db, incidentId, viewer))) throw notFound('Incident not found')
  const { rows } = await ctx.db.query<Row>(
    `${SELECT} WHERE c.incident_id = $1 ${isMod(viewer) ? '' : 'AND c.hidden = FALSE'} ORDER BY c.created_at, c.id LIMIT 200`,
    [incidentId],
  )
  const anon = await anonymousReporter(ctx, incidentId)
  return rows.map((r) => toDto(r, viewer, anon))
}

export async function addComment(ctx: Ctx, viewer: Viewer, incidentId: number, body: string): Promise<CommentDto> {
  const incident = await getIncident(ctx.db, incidentId, viewer)
  if (!incident) throw notFound('Incident not found')
  if (incident.status === 'rejected' || incident.status === 'withdrawn') throw conflict('comments_closed', 'Comments are closed for this incident')

  const ins = await ctx.db.query<{ id: string }>(
    'INSERT INTO incident_comments (incident_id, user_id, body) VALUES ($1, $2, $3) RETURNING id',
    [incidentId, viewer.id, body],
  )
  // The DTO hides anonymous reporters, so read the real owner from the database.
  const owner = await ctx.db.query<{ reporter_id: string }>('SELECT reporter_id FROM incidents WHERE id = $1', [incidentId])
  const reporterId = Number(owner.rows[0].reporter_id)
  if (reporterId !== viewer.id) {
    const who = await ctx.db.query<{ display_name: string }>('SELECT display_name FROM users WHERE id = $1', [viewer.id])
    const title = 'New comment on your report'
    const text = `${who.rows[0].display_name}: ${body.slice(0, 120)}`
    await ctx.db.query(
      `INSERT INTO notifications (user_id, incident_id, type, title, body) VALUES ($1, $2, 'comment', $3, $4)`,
      [reporterId, incidentId, title, text],
    )
    await bestEffort('push', () => ctx.realtime.push([reporterId], { title, body: text, incidentId }))
  }
  const { rows } = await ctx.db.query<Row>(`${SELECT} WHERE c.id = $1`, [ins.rows[0].id])
  return toDto(rows[0], viewer, await anonymousReporter(ctx, incidentId))
}

/** Authors can remove their own comment; moderators can remove anyone's. Comments are hidden, not erased. */
export async function hideComment(ctx: Ctx, viewer: Viewer, incidentId: number, commentId: number): Promise<void> {
  const { rows } = await ctx.db.query<{ user_id: string }>(
    'SELECT user_id FROM incident_comments WHERE id = $1 AND incident_id = $2',
    [commentId, incidentId],
  )
  if (!rows[0]) throw notFound('Comment not found')
  if (Number(rows[0].user_id) !== viewer.id && !isMod(viewer)) throw forbidden()
  await ctx.db.query('UPDATE incident_comments SET hidden = TRUE WHERE id = $1', [commentId])
}
