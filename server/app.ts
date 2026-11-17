import cors from 'cors'
import express, { type Express } from 'express'
import helmet from 'helmet'
import path from 'node:path'
import { authenticate, optionalAuth, type TokenVerifier } from './auth'
import type { Config } from './config'
import type { Db } from './db/pool'
import { errorHandler, notFoundHandler } from './errors'
import { createLimiters, DEFAULT_LIMITS, type RateLimits } from './middleware/rateLimit'
import { adminRoutes } from './routes/admin'
import { accountRoutes, publicAuthRoutes } from './routes/auth'
import { communityRoutes } from './routes/communities'
import { directoryRoutes } from './routes/directory'
import { planningRoutes } from './routes/planning'
import { safetyRoutes } from './routes/safety'
import { incidentRoutes } from './routes/incidents'
import { insightsRoutes } from './routes/insights'
import { meRoutes } from './routes/me'
import { PRODUCTION_CSP, serveFrontend } from './static'
import { noopRealtime, type Ctx, type Realtime } from './services/context'
import { createTokenService, type GoogleVerifier, type TokenService } from './services/localAuth'
import { createProviders, type Providers } from './services/providers'

export interface AppDeps {
  config: Config
  db: Db
  verifier: TokenVerifier
  realtime?: Realtime
  limits?: Partial<RateLimits>
  /** Routing, place search and clock. Defaults to OSRM and Nominatim; tests inject fakes. */
  providers?: Providers
  /** Signs session tokens. Defaults to a service built from the config. */
  tokens?: TokenService
  /** Verifies Google ID tokens. Omit to disable Google sign-in. */
  google?: GoogleVerifier
  /** Directory holding the built frontend. Defaults to ./dist and is only served in production. */
  staticDir?: string
}

export function createApp(deps: AppDeps): Express {
  const { config, db, verifier } = deps
  const ctx: Ctx = { db, config, realtime: deps.realtime ?? noopRealtime }
  const providers = deps.providers ?? createProviders(config)
  const limiters = createLimiters({ ...DEFAULT_LIMITS, ...deps.limits })
  const authDeps = { db, config, tokens: deps.tokens ?? createTokenService(config), google: deps.google }
  const required = authenticate(db, config, verifier)
  const optional = optionalAuth(db, config, verifier)

  const app = express()
  app.disable('x-powered-by')
  if (config.NODE_ENV === 'production') app.set('trust proxy', config.TRUST_PROXY)
  app.use(helmet(config.NODE_ENV === 'production' ? { contentSecurityPolicy: { directives: PRODUCTION_CSP } } : {}))
  app.use(cors({ origin: config.CORS_ORIGIN.split(',').map((o) => o.trim()), credentials: false }))
  app.use(express.json({ limit: '32kb' }))
  app.use('/api', limiters.global)

  app.get('/api/health', async (_req, res) => {
    await db.query('SELECT 1')
    res.json({ status: 'ok', time: new Date().toISOString() })
  })

  app.get('/api/categories', async (_req, res) => {
    const { rows } = await db.query('SELECT slug, name, severity_default FROM categories ORDER BY id')
    res.json({ categories: rows.map((c) => ({ slug: c.slug, name: c.name, severity: c.severity_default })) })
  })

  app.use(
    '/api/incidents',
    incidentRoutes(ctx, { optional, required, reportLimit: limiters.report, voteLimit: limiters.vote, commentLimit: limiters.comment }),
  )
  app.use('/api', insightsRoutes(ctx))
  app.use('/api', directoryRoutes(ctx, providers, limiters.geocode))
  app.use('/api/auth', publicAuthRoutes(authDeps, { auth: limiters.auth, login: limiters.login, register: limiters.register }))
  app.use('/api/auth', required, accountRoutes(authDeps, limiters.login))
  app.use('/api/admin', required, adminRoutes(ctx))
  app.use('/api', required, planningRoutes(ctx, providers, limiters.route))
  app.use('/api', required, communityRoutes(ctx, limiters.post))
  app.use('/api', required, safetyRoutes(ctx, { sos: limiters.sos, location: limiters.location }))
  app.use('/api', required, meRoutes(ctx))

  if (config.NODE_ENV === 'production') serveFrontend(app, deps.staticDir ?? path.resolve('dist'))

  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
