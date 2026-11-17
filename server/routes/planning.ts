import { Router, type RequestHandler } from 'express'
import { notFound } from '../errors'
import type { Ctx } from '../services/context'
import { planRoutes } from '../services/planner'
import type { Providers } from '../services/providers'
import { getSettings, updateSettings } from '../services/settings'
import { tripSuggestions } from '../services/trips'
import { idParam, placeSchema, routePlanSchema, settingsSchema, suggestionQuerySchema, tripRecordSchema } from '../validation'
import { badRequest } from '../errors'

/** Signed-in planning features: settings, saved places, route planning, trip history and suggestions. */
export function planningRoutes(ctx: Ctx, providers: Providers, routeLimit: RequestHandler): Router {
  const r = Router()

  r.get('/me/settings', async (req, res) => {
    res.json({ settings: await getSettings(ctx.db, req.user!.id) })
  })

  r.patch('/me/settings', async (req, res) => {
    res.json({ settings: await updateSettings(ctx.db, req.user!.id, settingsSchema.parse(req.body)) })
  })

  r.get('/me/places', async (req, res) => {
    const { rows } = await ctx.db.query(
      `SELECT id, label, kind, address_text, typical_days, arrive_by::text AS arrive_by,
              ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
         FROM saved_places WHERE user_id = $1 ORDER BY id`,
      [req.user!.id],
    )
    res.json({
      places: rows.map((p) => ({
        id: Number(p.id), label: p.label, kind: p.kind, addressText: p.address_text, typicalDays: p.typical_days,
        arriveBy: p.arrive_by ? String(p.arrive_by).slice(0, 5) : null, latitude: p.lat, longitude: p.lng,
      })),
    })
  })

  r.post('/me/places', async (req, res) => {
    const p = placeSchema.parse(req.body)
    const count = await ctx.db.query('SELECT count(*)::int AS n FROM saved_places WHERE user_id = $1', [req.user!.id])
    if (count.rows[0].n >= 10) throw badRequest('You can save up to 10 places')
    const { rows } = await ctx.db.query(
      `INSERT INTO saved_places (user_id, label, kind, location, address_text, typical_days, arrive_by)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, $6, $7, $8) RETURNING id`,
      [req.user!.id, p.label, p.kind, p.longitude, p.latitude, p.addressText ?? null, p.typicalDays, p.arriveBy ?? null],
    )
    res.status(201).json({ id: Number(rows[0].id) })
  })

  r.delete('/me/places/:id', async (req, res) => {
    const del = await ctx.db.query('DELETE FROM saved_places WHERE id = $1 AND user_id = $2', [idParam.parse(req.params.id), req.user!.id])
    if (!del.rowCount) throw notFound('Place not found')
    res.status(204).end()
  })

  r.post('/routes', routeLimit, async (req, res) => {
    const { from, to } = routePlanSchema.parse(req.body)
    const settings = await getSettings(ctx.db, req.user!.id)
    res.json({ ...(await planRoutes(ctx.db, providers, from, to, settings)), serverTime: new Date().toISOString() })
  })

  // Trip history feeds Trip Suggestions. It is only written when the user starts a trip, and can be cleared.
  r.post('/trips', async (req, res) => {
    const t = tripRecordSchema.parse(req.body)
    await ctx.db.query(
      `INSERT INTO trip_history (user_id, origin, destination, destination_label, distance_m, duration_s, safety_score)
       VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, $6, $7, $8, $9)`,
      [req.user!.id, t.from.lng, t.from.lat, t.to.lng, t.to.lat, t.destinationLabel ?? null, t.distanceM ?? null, t.durationS ?? null, t.safetyScore ?? null],
    )
    res.status(201).json({ ok: true })
  })

  r.delete('/trips/history', async (req, res) => {
    await ctx.db.query('DELETE FROM trip_history WHERE user_id = $1', [req.user!.id])
    res.status(204).end()
  })

  r.get('/trips/suggestions', routeLimit, async (req, res) => {
    const { lat, lng } = suggestionQuerySchema.parse(req.query)
    res.json({ ...(await tripSuggestions(ctx.db, providers, req.user!.id, { lat, lng })), serverTime: providers.now().toISOString() })
  })

  return r
}
