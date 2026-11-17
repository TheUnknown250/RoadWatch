import { Router, type RequestHandler } from 'express'
import type { Ctx } from '../services/context'
import {
  addPost, createCommunity, deleteCommunity, getCommunity, joinByCode, listMembers, listPosts, myCommunities, regenerateCode, removeMember, setRole,
} from '../services/communities'
import { communitySchema, idParam, joinSchema, postSchema, roleSchema } from '../validation'

export function communityRoutes(ctx: Ctx, postLimit: RequestHandler): Router {
  const r = Router()
  const me = (req: { user?: { id: number } }) => req.user!.id

  r.get('/communities', async (req, res) => {
    res.json({ communities: await myCommunities(ctx, me(req)) })
  })

  r.post('/communities', async (req, res) => {
    res.status(201).json({ community: await createCommunity(ctx, me(req), communitySchema.parse(req.body)) })
  })

  r.post('/communities/join', async (req, res) => {
    res.json({ community: await joinByCode(ctx, me(req), joinSchema.parse(req.body).code) })
  })

  r.get('/communities/:id', async (req, res) => {
    res.json({ community: await getCommunity(ctx, me(req), idParam.parse(req.params.id)) })
  })

  r.delete('/communities/:id', async (req, res) => {
    await deleteCommunity(ctx, me(req), idParam.parse(req.params.id))
    res.status(204).end()
  })

  r.post('/communities/:id/invite-code', async (req, res) => {
    res.json({ inviteCode: await regenerateCode(ctx, me(req), idParam.parse(req.params.id)) })
  })

  r.get('/communities/:id/members', async (req, res) => {
    res.json({ members: await listMembers(ctx, me(req), idParam.parse(req.params.id)) })
  })

  r.delete('/communities/:id/members/:userId', async (req, res) => {
    await removeMember(ctx, me(req), idParam.parse(req.params.id), idParam.parse(req.params.userId))
    res.status(204).end()
  })

  r.patch('/communities/:id/members/:userId', async (req, res) => {
    await setRole(ctx, me(req), idParam.parse(req.params.id), idParam.parse(req.params.userId), roleSchema.parse(req.body).role)
    res.status(204).end()
  })

  r.get('/communities/:id/posts', async (req, res) => {
    res.json({ posts: await listPosts(ctx, me(req), idParam.parse(req.params.id)) })
  })

  r.post('/communities/:id/posts', postLimit, async (req, res) => {
    await addPost(ctx, me(req), idParam.parse(req.params.id), postSchema.parse(req.body))
    res.status(201).json({ ok: true })
  })

  return r
}
