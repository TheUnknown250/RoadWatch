import { Router, type RequestHandler } from 'express'
import type { Ctx } from '../services/context'
import { endSession, getSession, mySessions, sharedWithMe, startSos, startTrip, updateLocation } from '../services/safety'
import { getSettings } from '../services/settings'
import { endSchema, idParam, locationSchema, sosSchema, tripStartSchema } from '../validation'

export function safetyRoutes(ctx: Ctx, limits: { sos: RequestHandler; location: RequestHandler }): Router {
  const r = Router()
  const who = (req: { user?: { id: number; displayName: string } }) => ({ id: req.user!.id, displayName: req.user!.displayName })

  r.post('/safety/sos', limits.sos, async (req, res) => {
    const input = sosSchema.parse(req.body)
    const settings = await getSettings(ctx.db, req.user!.id)
    const out = await startSos(ctx, who(req), input, settings.shareSosWithCommunities)
    res.status(out.existing ? 200 : 201).json(out)
  })

  r.post('/safety/trips', async (req, res) => {
    res.status(201).json({ session: await startTrip(ctx, who(req), tripStartSchema.parse(req.body)) })
  })

  r.get('/safety/mine', async (req, res) => {
    res.json({ sessions: await mySessions(ctx, req.user!.id) })
  })

  r.get('/safety/shared', async (req, res) => {
    res.json({ sessions: await sharedWithMe(ctx, req.user!.id), serverTime: new Date().toISOString() })
  })

  r.get('/safety/:id', async (req, res) => {
    res.json({ session: await getSession(ctx, req.user!.id, idParam.parse(req.params.id)), serverTime: new Date().toISOString() })
  })

  r.post('/safety/:id/location', limits.location, async (req, res) => {
    const { latitude, longitude } = locationSchema.parse(req.body)
    res.json({ session: await updateLocation(ctx, who(req), idParam.parse(req.params.id), latitude, longitude) })
  })

  r.post('/safety/:id/end', async (req, res) => {
    res.json({ session: await endSession(ctx, who(req), idParam.parse(req.params.id), endSchema.parse(req.body).outcome) })
  })

  return r
}
