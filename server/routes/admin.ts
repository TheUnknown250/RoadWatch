import { Router } from 'express'
import { requireRole } from '../auth'
import { badRequest, conflict, notFound } from '../errors'
import type { Ctx } from '../services/context'
import { listIncidents } from '../services/incidentQuery'
import { createAdvisory, removeAdvisory } from '../services/advisories'
import { moderateIncident } from '../services/incidents'
import { toContact } from './directory'
import { advisorySchema, directorySchema, idParam, listQuerySchema, moderationSchema, userAdminSchema } from '../validation'

export function adminRoutes(ctx: Ctx): Router {
  const r = Router()
  const mod = requireRole('moderator', 'admin')
  const admin = requireRole('admin')

  r.get('/incidents', mod, async (req, res) => {
    const q = listQuerySchema.parse(req.query)
    const incidents = await listIncidents(
      ctx.db,
      { categories: q.category, statuses: q.status ?? ['pending', 'disputed'], from: q.from, to: q.to, q: q.q, limit: q.limit, offset: q.offset },
      req.user,
    )
    res.json({ incidents })
  })

  r.patch('/incidents/:id/status', mod, async (req, res) => {
    const id = idParam.parse(req.params.id)
    const { status, reason } = moderationSchema.parse(req.body)
    if (status === 'pending') throw badRequest('Reports cannot be moved back to pending')
    res.json({ incident: await moderateIncident(ctx, req.user!.id, id, status, reason) })
  })

  r.get('/stats', mod, async (_req, res) => {
    const [byStatus, byCategory, totals] = await Promise.all([
      ctx.db.query('SELECT status, count(*)::int AS n FROM incidents GROUP BY status'),
      ctx.db.query(
        `SELECT c.slug, c.name, count(i.id)::int AS n FROM categories c LEFT JOIN incidents i ON i.category_id = c.id GROUP BY c.id ORDER BY c.id`,
      ),
      ctx.db.query(
        `SELECT (SELECT count(*)::int FROM users) AS users,
                (SELECT count(*)::int FROM incidents WHERE created_at > now() - interval '24 hours') AS last_24h`,
      ),
    ])
    res.json({
      byStatus: Object.fromEntries(byStatus.rows.map((s) => [s.status, s.n])),
      byCategory: byCategory.rows,
      users: totals.rows[0].users,
      incidentsLast24h: totals.rows[0].last_24h,
    })
  })

  r.get('/users', admin, async (_req, res) => {
    const { rows } = await ctx.db.query(
      'SELECT id, email, display_name, role, reputation, is_banned, created_at FROM users ORDER BY created_at DESC LIMIT 200',
    )
    res.json({
      users: rows.map((u) => ({
        id: Number(u.id), email: u.email, displayName: u.display_name, role: u.role, reputation: u.reputation,
        isBanned: u.is_banned, createdAt: u.created_at,
      })),
    })
  })

  r.patch('/users/:id', admin, async (req, res) => {
    const id = idParam.parse(req.params.id)
    const body = userAdminSchema.parse(req.body)
    if (id === req.user!.id) throw conflict('self_change', 'You cannot change your own role or suspension')
    const up = await ctx.db.query(
      `UPDATE users SET role = COALESCE($2, role), is_banned = COALESCE($3, is_banned) WHERE id = $1 RETURNING id`,
      [id, body.role ?? null, body.isBanned ?? null],
    )
    if (!up.rowCount) throw notFound('User not found')
    res.status(204).end()
  })

  r.get('/directory', admin, async (_req, res) => {
    const { rows } = await ctx.db.query('SELECT id, name, kind, phone, state, description, source_url, verified FROM emergency_contacts ORDER BY state NULLS FIRST, name')
    res.json({ contacts: rows.map(toContact) })
  })

  r.post('/directory', admin, async (req, res) => {
    const c = directorySchema.parse(req.body)
    const dup = await ctx.db.query('SELECT 1 FROM emergency_contacts WHERE phone = $1 AND state IS NOT DISTINCT FROM $2', [c.phone, c.state ?? null])
    if (dup.rowCount) throw conflict('duplicate_contact', 'That number is already listed for this area')
    const { rows } = await ctx.db.query(
      `INSERT INTO emergency_contacts (name, kind, phone, state, description, source_url, verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, kind, phone, state, description, source_url, verified`,
      [c.name, c.kind, c.phone, c.state ?? null, c.description ?? null, c.sourceUrl ?? null, c.verified],
    )
    res.status(201).json({ contact: toContact(rows[0]) })
  })

  r.delete('/directory/:id', admin, async (req, res) => {
    const del = await ctx.db.query('DELETE FROM emergency_contacts WHERE id = $1', [idParam.parse(req.params.id)])
    if (!del.rowCount) throw notFound('Contact not found')
    res.status(204).end()
  })

  r.post('/advisories', admin, async (req, res) => {
    const input = advisorySchema.parse(req.body)
    res.status(201).json({ advisory: await createAdvisory(ctx, req.user!.id, input) })
  })

  r.delete('/advisories/:id', admin, async (req, res) => {
    if (!(await removeAdvisory(ctx, idParam.parse(req.params.id)))) throw notFound('Advisory not found or already ended')
    res.status(204).end()
  })

  return r
}
