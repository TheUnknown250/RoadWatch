import type { Request, RequestHandler } from 'express'
import { ipKeyGenerator, rateLimit } from 'express-rate-limit'

export interface RateLimits {
  /** Requests per IP per 15 minutes across the whole API. */
  global: number
  /** Incident submissions per user per hour. */
  report: number
  /** Votes per user per hour. */
  vote: number
  /** Comments per user per hour. */
  comment: number
  /** Route searches per user per hour. */
  route: number
  /** Place searches and nearby-service lookups per user or IP per 15 minutes. */
  geocode: number
  /** SOS alerts per user per hour. */
  sos: number
  /** Live location updates per user per hour. */
  location: number
  /** Community posts per user per hour. */
  post: number
  /** Any sign-in or sign-up request per IP per 15 minutes. */
  auth: number
  /** Password attempts per IP and username per 15 minutes. */
  login: number
  /** New accounts per IP per hour. */
  register: number
}

export const DEFAULT_LIMITS: RateLimits = { global: 600, report: 10, vote: 60, comment: 30, route: 60, geocode: 40, sos: 10, location: 300, post: 30, auth: 40, login: 8, register: 8 }

const tooMany = {
  error: { code: 'rate_limited', message: 'Too many requests. Please slow down and try again shortly.' },
}

const userKey = (req: Request) => (req.user ? `u:${req.user.id}` : ipKeyGenerator(req.ip ?? ''))

function make(limit: number, windowMs: number, key?: (req: Request) => string): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: tooMany,
    ...(key ? { keyGenerator: key } : {}),
  })
}

export function createLimiters(limits: RateLimits) {
  return {
    global: make(limits.global, 15 * 60_000),
    report: make(limits.report, 60 * 60_000, userKey),
    vote: make(limits.vote, 60 * 60_000, userKey),
    comment: make(limits.comment, 60 * 60_000, userKey),
    route: make(limits.route, 60 * 60_000, userKey),
    geocode: make(limits.geocode, 15 * 60_000, userKey),
    sos: make(limits.sos, 60 * 60_000, userKey),
    location: make(limits.location, 60 * 60_000, userKey),
    post: make(limits.post, 60 * 60_000, userKey),
    auth: make(limits.auth, 15 * 60_000),
    login: make(limits.login, 15 * 60_000, (req) => `${ipKeyGenerator(req.ip ?? '')}|${typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase().slice(0, 40) : ''}`),
    register: make(limits.register, 60 * 60_000),
  }
}
