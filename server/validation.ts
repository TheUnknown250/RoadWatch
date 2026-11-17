import { z } from 'zod'
import { MODERATOR_STATUSES, STATUSES } from './services/status'

// Approximate bounding box of Nigeria. Rejects obviously wrong coordinates.
export const NIGERIA = { minLat: 4.2, maxLat: 13.9, minLng: 2.6, maxLng: 14.7 }

const lat = z.coerce.number().min(NIGERIA.minLat, 'Location must be within Nigeria').max(NIGERIA.maxLat, 'Location must be within Nigeria')
const lng = z.coerce.number().min(NIGERIA.minLng, 'Location must be within Nigeria').max(NIGERIA.maxLng, 'Location must be within Nigeria')

const text = (min: number, max: number) => z.string().trim().min(min).max(max)

export const newIncidentSchema = z.object({
  categorySlug: z.string().trim().min(1).max(40),
  title: text(3, 120),
  description: text(10, 2000),
  latitude: lat,
  longitude: lng,
  addressText: text(1, 200).optional(),
  state: text(1, 60).optional(),
  occurredAt: z.coerce.date().refine((d) => d.getTime() <= Date.now() + 5 * 60_000, 'Time cannot be in the future').refine(
    (d) => d.getTime() >= Date.now() - 7 * 24 * 3600_000,
    'Incidents older than 7 days cannot be reported',
  ),
  idempotencyKey: z.string().trim().min(8).max(100),
  isAnonymous: z.boolean().default(false),
})

export const voteSchema = z.object({
  vote: z.enum(['confirm', 'flag']),
  reason: text(1, 500).optional(),
})

const csv = z.string().transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))

export const listQuerySchema = z.object({
  bbox: z.string().optional().transform((s, ctx) => {
    if (!s) return undefined
    const parts = s.split(',').map(Number)
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
      ctx.addIssue({ code: 'custom', message: 'bbox must be west,south,east,north' })
      return z.NEVER
    }
    return parts as [number, number, number, number]
  }),
  lat: lat.optional(),
  lng: lng.optional(),
  radiusKm: z.coerce.number().min(0.1).max(200).default(25),
  category: csv.optional(),
  status: csv.pipe(z.array(z.enum(STATUSES))).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  q: text(1, 100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export const moderationSchema = z.object({
  status: z.enum([...MODERATOR_STATUSES, 'pending'] as const),
  reason: text(3, 500),
})

export const profileSchema = z.object({ displayName: text(2, 60) })

export const subscriptionSchema = z.object({
  latitude: lat,
  longitude: lng,
  radiusKm: z.coerce.number().min(0.5).max(100),
  categorySlugs: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  label: text(1, 60).optional(),
})

export const deviceSchema = z.object({ token: z.string().trim().min(20).max(4096) })

export const userAdminSchema = z.object({
  role: z.enum(['user', 'moderator', 'admin']).optional(),
  isBanned: z.boolean().optional(),
}).refine((v) => v.role !== undefined || v.isBanned !== undefined, 'Nothing to update')

export const idParam = z.coerce.number().int().positive()

export const commentSchema = z.object({ body: text(2, 500) })

export const advisorySchema = z.object({
  title: text(3, 120),
  body: text(10, 1000),
  severity: z.enum(['info', 'warning', 'critical']).default('info'),
  state: text(1, 60).optional(),
  expiresInHours: z.coerce.number().int().min(1).max(24 * 30).default(72),
  notify: z.boolean().default(false),
})

export const insightsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
})

export const scanQuerySchema = z.object({
  lat,
  lng,
  radiusKm: z.coerce.number().min(1).max(50).default(10),
  days: z.coerce.number().int().min(1).max(90).default(30),
})

// ---- Platform features ----

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM')
const point = z.object({ lat, lng })

export const settingsSchema = z
  .object({
    tripSuggestions: z.boolean(),
    avoidTolls: z.boolean(),
    avoidMotorways: z.boolean(),
    avoidFerries: z.boolean(),
    preferSafest: z.boolean(),
    shareSosWithCommunities: z.boolean(),
  })
  .partial()

export const placeSchema = z.object({
  label: text(1, 60),
  kind: z.enum(['home', 'work', 'school', 'other']).default('other'),
  latitude: lat,
  longitude: lng,
  addressText: text(1, 200).optional(),
  typicalDays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  arriveBy: hhmm.optional(),
})

export const routePlanSchema = z.object({ from: point, to: point })

export const tripRecordSchema = z.object({
  from: point,
  to: point,
  destinationLabel: text(1, 120).optional(),
  distanceM: z.number().int().min(0).max(5_000_000).optional(),
  durationS: z.number().int().min(0).max(1_000_000).optional(),
  safetyScore: z.number().int().min(0).max(100).optional(),
})

export const suggestionQuerySchema = z.object({ lat, lng })

export const placeSearchSchema = z.object({ q: text(2, 100) })

export const nearbyQuerySchema = z.object({
  lat,
  lng,
  radiusKm: z.coerce.number().min(1).max(25).default(8),
})

export const communitySchema = z.object({
  name: text(3, 60),
  type: z.enum(['family', 'neighborhood', 'workplace', 'school', 'other']),
  description: text(1, 300).optional(),
})

export const joinSchema = z.object({ code: z.string().trim().min(6).max(12).regex(/^[A-Za-z0-9]+$/, 'Invite codes use letters and numbers only') })

export const postSchema = z.object({
  kind: z.enum(['alert', 'message']).default('message'),
  body: text(2, 500),
  latitude: lat.optional(),
  longitude: lng.optional(),
}).refine((v) => (v.latitude === undefined) === (v.longitude === undefined), 'Send both latitude and longitude, or neither')

export const roleSchema = z.object({ role: z.enum(['admin', 'member']) })

export const sosSchema = z.object({ latitude: lat, longitude: lng, message: text(1, 300).optional() })

export const tripStartSchema = z.object({
  latitude: lat,
  longitude: lng,
  destination: point,
  destinationLabel: text(1, 120).optional(),
  expectedArrivalAt: z.coerce.date().refine((d) => d.getTime() > Date.now(), 'Arrival must be in the future').refine((d) => d.getTime() < Date.now() + 24 * 3600_000, 'Arrival must be within 24 hours'),
  graceMinutes: z.coerce.number().int().min(5).max(120).default(15),
  communityIds: z.array(z.number().int().positive()).max(25).default([]),
})

export const locationSchema = z.object({ latitude: lat, longitude: lng })

export const endSchema = z.object({ outcome: z.enum(['arrived', 'safe', 'cancelled']) })

export const directoryQuerySchema = z.object({ state: text(1, 60).optional() })

export const directorySchema = z.object({
  name: text(2, 100),
  kind: z.enum(['general', 'police', 'fire', 'ambulance', 'road', 'disaster', 'hospital']),
  phone: z.string().trim().regex(/^[0-9+() -]{3,24}$/, 'Enter a phone number'),
  state: text(1, 60).optional(),
  description: text(1, 300).optional(),
  sourceUrl: z.string().trim().url().max(300).optional(),
  verified: z.boolean().default(false),
})

// ---- Accounts ----

export const registerSchema = z.object({
  username: z.string().trim().min(3, 'Use at least 3 characters').max(20, 'Use at most 20 characters'),
  password: z.string().min(1, 'Enter a password').max(128, 'Use at most 128 characters'),
  displayName: text(2, 60).optional(),
})

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Enter your username').max(40),
  password: z.string().min(1, 'Enter your password').max(128),
})

export const googleSchema = z.object({ credential: z.string().min(20).max(4000) })

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(1).max(128),
})
