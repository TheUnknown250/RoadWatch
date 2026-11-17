import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { Config } from './config'
import type { Db } from './db/pool'
import { forbidden, unauthorized } from './errors'

export type Role = 'user' | 'moderator' | 'admin'

export interface DecodedToken {
  uid: string
  email?: string
  emailVerified?: boolean
  name?: string
  /** `local` tokens were issued by this server for an existing account; they never create users. */
  provider?: 'local' | 'external'
  tokenVersion?: number
}

/** Turns a bearer token into an identity. Production uses signed session tokens; tests inject a fake. */
export interface TokenVerifier {
  verify(idToken: string): Promise<DecodedToken>
}

export interface AuthUser {
  id: number
  /** Provider identity: `local:<uuid>`, `google:<sub>`. */
  firebaseUid: string
  email: string | null
  displayName: string
  role: Role
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser
  }
}

interface UserRow {
  id: string
  firebase_uid: string
  email: string | null
  display_name: string
  role: Role
  is_banned: boolean
  token_version: number
}

function toAuthUser(r: UserRow): AuthUser {
  return { id: Number(r.id), firebaseUid: r.firebase_uid, email: r.email, displayName: r.display_name, role: r.role }
}

/** Finds the PostgreSQL user for a verified identity, creating external (Google) users on first sign-in. */
export async function resolveUser(db: Db, config: Config, token: DecodedToken): Promise<AuthUser> {
  if (token.provider === 'local') {
    // Our own session token: the account must already exist and the token must not have been revoked.
    const found = await db.query<UserRow>('SELECT id, firebase_uid, email, display_name, role, is_banned, token_version FROM users WHERE firebase_uid = $1', [token.uid])
    const u = found.rows[0]
    if (!u || u.token_version !== token.tokenVersion) throw unauthorized('Your session has ended. Please sign in again')
    if (u.is_banned) throw forbidden('This account has been suspended')
    return toAuthUser(u)
  }
  const admins = config.ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  const isAdminEmail = Boolean(token.email && token.emailVerified && admins.includes(token.email.toLowerCase()))
  const fallbackName = token.name?.trim() || token.email?.split('@')[0] || 'Road user'

  const { rows } = await db.query<UserRow>(
    `INSERT INTO users (firebase_uid, email, display_name, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (firebase_uid) DO UPDATE SET
       email = COALESCE(EXCLUDED.email, users.email),
       role = CASE WHEN EXCLUDED.role = 'admin' THEN 'admin' ELSE users.role END
     RETURNING id, firebase_uid, email, display_name, role, is_banned, token_version`,
    [token.uid, token.email ?? null, fallbackName.slice(0, 60), isAdminEmail ? 'admin' : 'user'],
  )
  const row = rows[0]
  if (row.is_banned) throw forbidden('This account has been suspended')
  return toAuthUser(row)
}

export function authenticate(db: Db, config: Config, verifier: TokenVerifier): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.header('authorization')
    if (!header?.startsWith('Bearer ')) throw unauthorized()
    let decoded: DecodedToken
    try {
      decoded = await verifier.verify(header.slice(7))
    } catch {
      throw unauthorized('Your session is invalid or has expired')
    }
    req.user = await resolveUser(db, config, decoded)
    next()
  }
}

/** Attaches the user when a valid token is sent; anonymous requests continue unauthenticated. */
export function optionalAuth(db: Db, config: Config, verifier: TokenVerifier): RequestHandler {
  return async (req, _res, next) => {
    const header = req.header('authorization')
    if (header?.startsWith('Bearer ')) {
      try {
        req.user = await resolveUser(db, config, await verifier.verify(header.slice(7)))
      } catch {
        // Invalid or expired tokens on public routes are treated as anonymous.
      }
    }
    next()
  }
}

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw unauthorized()
    if (!roles.includes(req.user.role)) throw forbidden()
    next()
  }
}
