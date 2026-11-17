import { randomUUID } from 'node:crypto'
import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose'
import type { DecodedToken, TokenVerifier } from '../auth'
import { resolveUser } from '../auth'
import { DEV_AUTH_SECRET, type Config } from '../config'
import type { Db } from '../db/pool'
import { badRequest, conflict, forbidden, HttpError, unauthorized } from '../errors'

const ISSUER = 'roadwatch'
const AUDIENCE = 'roadwatch-web'

export const USERNAME_RE = /^[a-z0-9_.]{3,20}$/
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 128

const RESERVED = new Set(['admin', 'administrator', 'root', 'support', 'roadwatch', 'moderator', 'system', 'official', 'help', 'security', 'null', 'undefined'])

// A short list of the worst offenders. Length is the main defence; this catches the obvious ones.
const COMMON = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwertyui', 'qwerty123', 'iloveyou', 'letmein123',
  'welcome1', 'welcome123', 'abc12345', 'admin123', 'nigeria123', 'nigerians', 'lagos1234', 'abuja1234', 'football1', 'monkey123',
])

export interface SessionUser {
  id: number
  email: string | null
  displayName: string
  role: string
  reputation: number
  createdAt: string
}

/** Rules a new password must meet. Returns a message, or null when acceptable. */
export function passwordProblem(password: string, username?: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters`
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters`
  const lower = password.toLowerCase()
  if (COMMON.has(lower)) return 'That password is too common. Choose something harder to guess'
  if (username && lower.includes(username.toLowerCase())) return 'Do not include your username in your password'
  if (/^(.)\1+$/.test(password)) return 'Do not repeat a single character'
  return null
}

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase()
}

export function usernameProblem(username: string): string | null {
  if (!USERNAME_RE.test(username)) return 'Use 3 to 20 letters, numbers, dots or underscores'
  if (RESERVED.has(username)) return 'That username is not available'
  return null
}

export function createTokenService(config: Config) {
  const secret = new TextEncoder().encode(config.AUTH_SECRET ?? DEV_AUTH_SECRET)
  const ttl = `${config.SESSION_DAYS}d`

  async function sign(user: { firebaseUid: string; tokenVersion: number }): Promise<string> {
    return new SignJWT({ tv: user.tokenVersion })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.firebaseUid)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(ttl)
      .sign(secret)
  }

  const verifier: TokenVerifier = {
    async verify(token): Promise<DecodedToken> {
      const { payload } = await jwtVerify(token, secret, { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'] })
      if (!payload.sub || typeof payload.tv !== 'number') throw new Error('Malformed token')
      return { uid: payload.sub, provider: 'local', tokenVersion: payload.tv }
    },
  }
  return { sign, verifier }
}

export type TokenService = ReturnType<typeof createTokenService>

// ---- Google ----

export interface GoogleIdentity {
  sub: string
  email: string
  emailVerified: boolean
  name?: string
}

export interface GoogleVerifier {
  verify(credential: string): Promise<GoogleIdentity>
}

/** Verifies a Google Identity Services ID token against Google's published signing keys. */
export function createGoogleVerifier(clientId: string): GoogleVerifier {
  const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))
  return {
    async verify(credential) {
      const { payload } = await jwtVerify(credential, keys, { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: clientId })
      if (!payload.sub || typeof payload.email !== 'string') throw new Error('Google token has no email')
      const verified = payload.email_verified === true || payload.email_verified === 'true'
      return { sub: payload.sub, email: payload.email, emailVerified: verified, name: typeof payload.name === 'string' ? payload.name : undefined }
    },
  }
}

// ---- Accounts ----

interface AccountRow {
  id: string
  firebase_uid: string
  email: string | null
  display_name: string
  role: string
  reputation: number
  created_at: Date
  is_banned: boolean
  password_hash: string | null
  token_version: number
}

const COLUMNS = 'id, firebase_uid, email, display_name, role, reputation, created_at, is_banned, password_hash, token_version'

const toUser = (r: AccountRow): SessionUser => ({
  id: Number(r.id), email: r.email, displayName: r.display_name, role: r.role, reputation: r.reputation, createdAt: r.created_at.toISOString(),
})

// Verifying against a real hash for unknown usernames keeps response time similar, so timing does not reveal which usernames exist.
let dummyHash: Promise<string> | null = null
const getDummyHash = () => (dummyHash ??= Bun.password.hash('not-a-real-password-for-timing', { algorithm: 'argon2id' }))

export interface AuthDeps {
  db: Db
  config: Config
  tokens: TokenService
  google?: GoogleVerifier
}

export async function registerAccount(deps: AuthDeps, input: { username: string; password: string; displayName?: string }) {
  const username = normalizeUsername(input.username)
  const problem = usernameProblem(username) ?? passwordProblem(input.password, username)
  if (problem) throw badRequest(problem)
  const hash = await Bun.password.hash(input.password, { algorithm: 'argon2id' })
  const displayName = (input.displayName?.trim() || username).slice(0, 60)
  try {
    const { rows } = await deps.db.query<AccountRow>(
      `INSERT INTO users (firebase_uid, username, password_hash, display_name, auth_provider)
       VALUES ($1, $2, $3, $4, 'password') RETURNING ${COLUMNS}`,
      [`local:${randomUUID()}`, username, hash, displayName],
    )
    const row = rows[0]
    return { token: await deps.tokens.sign({ firebaseUid: row.firebase_uid, tokenVersion: row.token_version }), user: toUser(row) }
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw conflict('username_taken', 'That username is already taken')
    throw err
  }
}

export async function loginAccount(deps: AuthDeps, input: { username: string; password: string }) {
  const username = normalizeUsername(input.username)
  const { rows } = await deps.db.query<AccountRow>(`SELECT ${COLUMNS} FROM users WHERE username = $1`, [username])
  const row = rows[0]
  const ok = await Bun.password.verify(input.password, row?.password_hash ?? (await getDummyHash()))
  if (!row || !row.password_hash || !ok) throw new HttpError(401, 'invalid_credentials', 'Incorrect username or password')
  if (row.is_banned) throw forbidden('This account has been suspended')
  return { token: await deps.tokens.sign({ firebaseUid: row.firebase_uid, tokenVersion: row.token_version }), user: toUser(row) }
}

export async function googleLogin(deps: AuthDeps, credential: string) {
  if (!deps.google) throw new HttpError(503, 'google_not_configured', 'Google sign-in is not set up on this server')
  let identity: GoogleIdentity
  try {
    identity = await deps.google.verify(credential)
  } catch {
    throw unauthorized('Google could not confirm your sign-in. Please try again')
  }
  if (!identity.emailVerified) throw unauthorized('Your Google email address is not verified')
  // Reuses first-sign-in provisioning, including promotion for ADMIN_EMAILS.
  const user = await resolveUser(deps.db, deps.config, { uid: `google:${identity.sub}`, email: identity.email, emailVerified: true, name: identity.name, provider: 'external' })
  const { rows } = await deps.db.query<AccountRow>(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [user.id])
  await deps.db.query("UPDATE users SET auth_provider = 'google' WHERE id = $1 AND auth_provider = 'external'", [user.id])
  const row = rows[0]
  return { token: await deps.tokens.sign({ firebaseUid: row.firebase_uid, tokenVersion: row.token_version }), user: toUser(row) }
}

export async function changePassword(deps: AuthDeps, userId: number, current: string, next: string) {
  const { rows } = await deps.db.query<AccountRow & { username: string | null }>(`SELECT ${COLUMNS}, username FROM users WHERE id = $1`, [userId])
  const row = rows[0]
  if (!row.password_hash) throw badRequest('This account signs in with Google and has no password')
  if (!(await Bun.password.verify(current, row.password_hash))) throw new HttpError(401, 'invalid_credentials', 'Your current password is incorrect')
  const problem = passwordProblem(next, row.username ?? undefined)
  if (problem) throw badRequest(problem)
  if (current === next) throw badRequest('Choose a password you have not used just now')
  const hash = await Bun.password.hash(next, { algorithm: 'argon2id' })
  // Bumping the version signs the account out everywhere else; the caller gets a fresh token.
  const upd = await deps.db.query<{ token_version: number }>(
    'UPDATE users SET password_hash = $2, token_version = token_version + 1 WHERE id = $1 RETURNING token_version',
    [userId, hash],
  )
  return { token: await deps.tokens.sign({ firebaseUid: row.firebase_uid, tokenVersion: upd.rows[0].token_version }) }
}

export async function signOutEverywhere(db: Db, userId: number): Promise<void> {
  await db.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [userId])
}
