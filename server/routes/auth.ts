import { Router, type RequestHandler } from 'express'
import { PASSWORD_MAX, PASSWORD_MIN, changePassword, googleLogin, loginAccount, registerAccount, signOutEverywhere, type AuthDeps } from '../services/localAuth'
import { changePasswordSchema, googleSchema, loginSchema, registerSchema } from '../validation'

/** Public sign-in and sign-up. Every route is rate limited because it accepts guessable secrets. */
export function publicAuthRoutes(deps: AuthDeps, limits: { auth: RequestHandler; login: RequestHandler; register: RequestHandler }): Router {
  const r = Router()

  r.get('/config', (_req, res) => {
    res.json({ googleClientId: deps.google ? (deps.config.GOOGLE_CLIENT_ID ?? null) : null, passwordMin: PASSWORD_MIN, passwordMax: PASSWORD_MAX })
  })

  r.post('/register', limits.auth, limits.register, async (req, res) => {
    res.status(201).json(await registerAccount(deps, registerSchema.parse(req.body)))
  })

  r.post('/login', limits.auth, limits.login, async (req, res) => {
    res.json(await loginAccount(deps, loginSchema.parse(req.body)))
  })

  r.post('/google', limits.auth, async (req, res) => {
    res.json(await googleLogin(deps, googleSchema.parse(req.body).credential))
  })

  return r
}

/** Mounted behind authentication. */
export function accountRoutes(deps: AuthDeps, limit: RequestHandler): Router {
  const r = Router()

  r.post('/password', limit, async (req, res) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body)
    res.json(await changePassword(deps, req.user!.id, currentPassword, newPassword))
  })

  r.post('/logout-all', async (req, res) => {
    await signOutEverywhere(deps.db, req.user!.id)
    res.status(204).end()
  })

  return r
}
