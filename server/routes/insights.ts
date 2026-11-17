import { Router } from 'express'
import { activeAdvisories } from '../services/advisories'
import type { Ctx } from '../services/context'
import { hotspots, summary } from '../services/insights'
import { safetyScan } from '../services/safetyScan'
import { insightsQuerySchema, scanQuerySchema } from '../validation'

/** Public, read-only aggregates and official advisories. */
export function insightsRoutes(ctx: Ctx): Router {
  const r = Router()

  r.get('/insights/summary', async (req, res) => {
    const { days } = insightsQuerySchema.parse(req.query)
    res.json({ ...(await summary(ctx.db, days)), serverTime: new Date().toISOString() })
  })

  r.get('/insights/hotspots', async (req, res) => {
    const { days } = insightsQuerySchema.parse(req.query)
    res.json({ hotspots: await hotspots(ctx.db, days), days, serverTime: new Date().toISOString() })
  })

  r.get('/insights/scan', async (req, res) => {
    const q = scanQuerySchema.parse(req.query)
    res.json({ ...(await safetyScan(ctx.db, q.lat, q.lng, q.radiusKm, q.days)), serverTime: new Date().toISOString() })
  })

  r.get('/advisories', async (_req, res) => {
    res.json({ advisories: await activeAdvisories(ctx), serverTime: new Date().toISOString() })
  })

  return r
}
