import { Router } from 'express'
import { withTx } from '../db/pool'
import { badRequest, notFound } from '../errors'
import type { Ctx } from '../services/context'
import { listIncidents } from '../services/incidentQuery'
import { deviceSchema, idParam, profileSchema, subscriptionSchema } from '../validation'

/** Mounted under an authenticated prefix; every handler may rely on req.user. */
export function meRoutes(ctx: Ctx): Router {
  const r = Router()

  r.get('/me', async (req, res) => {
    const { rows } = await ctx.db.query(
      'SELECT id, email, display_name, role, reputation, created_at, (password_hash IS NOT NULL) AS has_password FROM users WHERE id = $1',
      [req.user!.id],
    )
    const u = rows[0]
    res.json({ user: { id: Number(u.id), email: u.email, displayName: u.display_name, role: u.role, reputation: u.reputation, createdAt: u.created_at, hasPassword: u.has_password } })
  })

  r.patch('/me', async (req, res) => {
    const { displayName } = profileSchema.parse(req.body)
    await ctx.db.query('UPDATE users SET display_name = $2 WHERE id = $1', [req.user!.id, displayName])
    res.json({ displayName })
  })

  // Right to erasure: personal data is removed, public contributions stay under an anonymous name.
  r.delete('/me', async (req, res) => {
    const id = req.user!.id
    await withTx(ctx.db, async (client) => {
      await client.query('DELETE FROM device_tokens WHERE user_id = $1', [id])
      await client.query('DELETE FROM area_subscriptions WHERE user_id = $1', [id])
      await client.query('DELETE FROM notifications WHERE user_id = $1', [id])
      await client.query(
        `UPDATE users SET email = NULL, display_name = 'Deleted user', firebase_uid = 'deleted-' || id::text,
                username = NULL, password_hash = NULL, token_version = token_version + 1,
                role = 'user', is_banned = TRUE WHERE id = $1`,
        [id],
      )
    })
    res.status(204).end()
  })

  r.get('/me/incidents', async (req, res) => {
    const incidents = await listIncidents(
      ctx.db,
      { reporterId: req.user!.id, statuses: ['pending', 'verified', 'disputed', 'resolved', 'rejected', 'expired', 'withdrawn'], limit: 100, offset: 0 },
      req.user,
    )
    res.json({ incidents })
  })

  r.get('/me/subscriptions', async (req, res) => {
    const { rows } = await ctx.db.query(
      `SELECT id, ST_Y(center::geometry) AS lat, ST_X(center::geometry) AS lng, radius_m, label, category_ids
         FROM area_subscriptions WHERE user_id = $1 ORDER BY id`,
      [req.user!.id],
    )
    res.json({
      subscriptions: rows.map((s) => ({ id: Number(s.id), latitude: s.lat, longitude: s.lng, radiusKm: s.radius_m / 1000, label: s.label, categoryIds: s.category_ids })),
    })
  })

  r.post('/me/subscriptions', async (req, res) => {
    const s = subscriptionSchema.parse(req.body)
    const count = await ctx.db.query('SELECT count(*)::int AS n FROM area_subscriptions WHERE user_id = $1', [req.user!.id])
    if (count.rows[0].n >= 5) throw badRequest('You can follow up to 5 areas')
    const cats = await ctx.db.query<{ id: number }>('SELECT id FROM categories WHERE slug = ANY($1)', [s.categorySlugs])
    if (cats.rows.length !== new Set(s.categorySlugs).size) throw badRequest('Unknown category')
    const { rows } = await ctx.db.query(
      `INSERT INTO area_subscriptions (user_id, center, radius_m, category_ids, label)
       VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4, $5, $6) RETURNING id`,
      [req.user!.id, s.longitude, s.latitude, Math.round(s.radiusKm * 1000), cats.rows.map((c) => c.id), s.label ?? null],
    )
    res.status(201).json({ id: Number(rows[0].id) })
  })

  r.delete('/me/subscriptions/:id', async (req, res) => {
    const id = idParam.parse(req.params.id)
    const del = await ctx.db.query('DELETE FROM area_subscriptions WHERE id = $1 AND user_id = $2', [id, req.user!.id])
    if (!del.rowCount) throw notFound('Subscription not found')
    res.status(204).end()
  })

  r.post('/me/devices', async (req, res) => {
    const { token } = deviceSchema.parse(req.body)
    // A device token belongs to whoever registered it most recently.
    await ctx.db.query(
      `INSERT INTO device_tokens (user_id, fcm_token) VALUES ($1, $2)
       ON CONFLICT (fcm_token) DO UPDATE SET user_id = EXCLUDED.user_id`,
      [req.user!.id, token],
    )
    res.status(204).end()
  })

  r.delete('/me/devices', async (req, res) => {
    const { token } = deviceSchema.parse(req.body)
    await ctx.db.query('DELETE FROM device_tokens WHERE fcm_token = $1 AND user_id = $2', [token, req.user!.id])
    res.status(204).end()
  })

  r.get('/notifications', async (req, res) => {
    const { rows } = await ctx.db.query(
      `SELECT id, incident_id, type, title, body, read_at, created_at FROM notifications
        WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 50`,
      [req.user!.id],
    )
    res.json({
      notifications: rows.map((n) => ({
        id: Number(n.id), incidentId: n.incident_id ? Number(n.incident_id) : null, type: n.type, title: n.title,
        body: n.body, readAt: n.read_at, createdAt: n.created_at,
      })),
      unread: rows.filter((n) => !n.read_at).length,
    })
  })

  r.post('/notifications/read-all', async (req, res) => {
    await ctx.db.query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [req.user!.id])
    res.status(204).end()
  })

  r.post('/notifications/:id/read', async (req, res) => {
    const id = idParam.parse(req.params.id)
    const up = await ctx.db.query('UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2', [id, req.user!.id])
    if (!up.rowCount) throw notFound('Notification not found')
    res.status(204).end()
  })

  return r
}
