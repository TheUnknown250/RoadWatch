import { Router, type RequestHandler } from 'express'
import { HttpError } from '../errors'
import type { Ctx } from '../services/context'
import { distanceM } from '../services/trips'
import type { PlaceResult, Providers, ServiceKind } from '../services/providers'
import { directoryQuerySchema, nearbyQuerySchema, placeSearchSchema } from '../validation'

export interface DirectoryContact {
  id: number
  name: string
  kind: string
  phone: string
  state: string | null
  description: string | null
  sourceUrl: string | null
  verified: boolean
}

export function toContact(r: Record<string, unknown>): DirectoryContact {
  return {
    id: Number(r.id), name: r.name as string, kind: r.kind as string, phone: r.phone as string, state: (r.state as string | null) ?? null,
    description: (r.description as string | null) ?? null, sourceUrl: (r.source_url as string | null) ?? null, verified: r.verified as boolean,
  }
}

/** Public lookups: emergency directory, nearby services and place search. */
export function directoryRoutes(ctx: Ctx, providers: Providers, geocodeLimit: RequestHandler): Router {
  const r = Router()

  r.get('/directory', async (req, res) => {
    const { state } = directoryQuerySchema.parse(req.query)
    const { rows } = await ctx.db.query(
      `SELECT id, name, kind, phone, state, description, source_url, verified FROM emergency_contacts
        WHERE state IS NULL OR ($1::text IS NOT NULL AND lower(state) = lower($1))
        ORDER BY (state IS NULL) DESC, state, CASE kind WHEN 'general' THEN 0 ELSE 1 END, name`,
      [state ?? null],
    )
    res.json({ contacts: rows.map(toContact) })
  })

  r.get('/directory/nearby', geocodeLimit, async (req, res) => {
    const { lat, lng, radiusKm } = nearbyQuerySchema.parse(req.query)
    const kinds: ServiceKind[] = ['hospital', 'police', 'fire']
    const results: (PlaceResult & { kind: ServiceKind; distanceM: number })[] = []
    let failed = 0
    for (const kind of kinds) {
      try {
        for (const p of await providers.places.nearby(kind, lat, lng, radiusKm)) {
          results.push({ ...p, kind, distanceM: Math.round(distanceM({ lat, lng }, p)) })
        }
      } catch (err) {
        if (!(err instanceof HttpError)) throw err
        failed++
      }
    }
    if (failed === kinds.length) throw new HttpError(502, 'places_unavailable', 'Nearby services could not be loaded right now.')
    res.json({ services: results.sort((a, b) => a.distanceM - b.distanceM), partial: failed > 0, attribution: 'Data from OpenStreetMap contributors' })
  })

  r.get('/places/search', geocodeLimit, async (req, res) => {
    const { q } = placeSearchSchema.parse(req.query)
    res.json({ places: await providers.places.search(q), attribution: 'Data from OpenStreetMap contributors' })
  })

  return r
}
