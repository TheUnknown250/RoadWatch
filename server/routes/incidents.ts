import { Router } from 'express'
import type { RequestHandler } from 'express'
import { notFound } from '../errors'
import { getIncident, listIncidents } from '../services/incidentQuery'
import { addComment, hideComment, listComments } from '../services/comments'
import { createIncident, statusHistory, voteOnIncident, withdrawIncident } from '../services/incidents'
import type { Ctx } from '../services/context'
import { commentSchema, idParam, listQuerySchema, newIncidentSchema, voteSchema } from '../validation'

interface Guards {
  optional: RequestHandler
  required: RequestHandler
  reportLimit: RequestHandler
  voteLimit: RequestHandler
  commentLimit: RequestHandler
}

export function incidentRoutes(ctx: Ctx, g: Guards): Router {
  const r = Router()

  r.get('/', g.optional, async (req, res) => {
    const q = listQuerySchema.parse(req.query)
    const near = q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng, radiusM: q.radiusKm * 1000 } : undefined
    const incidents = await listIncidents(
      ctx.db,
      { bbox: q.bbox, near, categories: q.category, statuses: q.status, from: q.from, to: q.to, q: q.q, limit: q.limit, offset: q.offset },
      req.user,
    )
    res.json({ incidents, serverTime: new Date().toISOString() })
  })

  r.get('/:id', g.optional, async (req, res) => {
    const id = idParam.parse(req.params.id)
    const incident = await getIncident(ctx.db, id, req.user)
    if (!incident) throw notFound('Incident not found')
    res.json({ incident, history: await statusHistory(ctx, id, req.user), serverTime: new Date().toISOString() })
  })

  r.post('/', g.required, g.reportLimit, async (req, res) => {
    const input = newIncidentSchema.parse(req.body)
    const { incident, replayed } = await createIncident(ctx, req.user!.id, input)
    res.status(replayed ? 200 : 201).json({ incident, replayed })
  })

  r.post('/:id/verifications', g.required, g.voteLimit, async (req, res) => {
    const id = idParam.parse(req.params.id)
    const { vote, reason } = voteSchema.parse(req.body)
    res.status(201).json({ incident: await voteOnIncident(ctx, req.user!.id, id, vote, reason) })
  })

  r.post('/:id/withdraw', g.required, async (req, res) => {
    res.json({ incident: await withdrawIncident(ctx, req.user!.id, idParam.parse(req.params.id)) })
  })

  r.get('/:id/comments', g.optional, async (req, res) => {
    res.json({ comments: await listComments(ctx, idParam.parse(req.params.id), req.user) })
  })

  r.post('/:id/comments', g.required, g.commentLimit, async (req, res) => {
    const { body } = commentSchema.parse(req.body)
    res.status(201).json({ comment: await addComment(ctx, req.user!, idParam.parse(req.params.id), body) })
  })

  r.delete('/:id/comments/:commentId', g.required, async (req, res) => {
    await hideComment(ctx, req.user!, idParam.parse(req.params.id), idParam.parse(req.params.commentId))
    res.status(204).end()
  })

  return r
}
