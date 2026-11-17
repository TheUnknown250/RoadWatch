import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { SignJWT } from 'jose'
import { loadConfig, DEV_AUTH_SECRET } from '../config'
import { createTokenService, passwordProblem, usernameProblem, type GoogleIdentity, type GoogleVerifier } from '../services/localAuth'
import { startTestApp } from './helpers'

let nextGoogle: GoogleIdentity | Error = { sub: 'g-1', email: 'ada@gmail.test', emailVerified: true, name: 'Ada Obi' }
const google: GoogleVerifier = {
  async verify() {
    if (nextGoogle instanceof Error) throw nextGoogle
    return nextGoogle
  },
}

const t = await startTestApp('auth', { realAuth: true, google, limits: { auth: 1000, login: 1000, register: 1000 } })
afterAll(() => t.close())
beforeEach(async () => {
  await t.db.query('TRUNCATE users RESTART IDENTITY CASCADE')
  nextGoogle = { sub: 'g-1', email: 'ada@gmail.test', emailVerified: true, name: 'Ada Obi' }
})

const PW = 'correct horse battery'
const register = (over: Record<string, unknown> = {}) => t.api('/api/auth/register', { body: { username: 'ada_obi', password: PW, ...over } })
const login = (username = 'ada_obi', password = PW) => t.api('/api/auth/login', { body: { username, password } })
const me = (token: string) => t.api('/api/me', { token })

describe('rules', () => {
  test('usernames: 3-20 lowercase letters, numbers, dots or underscores; reserved names are blocked', () => {
    expect(usernameProblem('ada_obi')).toBeNull()
    for (const bad of ['ab', 'a'.repeat(21), 'has space', 'Ünï', 'a-b', 'admin', 'roadwatch']) expect(usernameProblem(bad)).not.toBeNull()
  })
  test('passwords: length, common passwords, username inside, single repeated character', () => {
    expect(passwordProblem(PW, 'ada')).toBeNull()
    expect(passwordProblem('short1', 'ada')).toContain('at least 8')
    expect(passwordProblem('password123')).toContain('too common')
    expect(passwordProblem('xxada_obixx', 'ada_obi')).toContain('username')
    expect(passwordProblem('aaaaaaaaaa')).toContain('repeat')
    expect(passwordProblem('x'.repeat(129))).toContain('at most')
  })
})

describe('sign up', () => {
  test('creates an account, stores only an Argon2id hash, and returns a working session', async () => {
    const r = await register({ displayName: 'Ada Obi' })
    expect(r.status).toBe(201)
    expect(r.body.user).toMatchObject({ displayName: 'Ada Obi', role: 'user' })
    expect(JSON.stringify(r.body)).not.toContain('password_hash')
    const row = (await t.db.query("SELECT password_hash, auth_provider, firebase_uid FROM users WHERE username = 'ada_obi'")).rows[0]
    expect(row.password_hash).toStartWith('$argon2id$')
    expect(row.password_hash).not.toContain(PW)
    expect(row.auth_provider).toBe('password')
    expect(row.firebase_uid).toStartWith('local:')
    expect((await me(r.body.token)).body.user.displayName).toBe('Ada Obi')
  })

  test('the display name defaults to the username, and usernames are case-insensitive and unique', async () => {
    expect((await register({ username: 'Ada_Obi' })).body.user.displayName).toBe('ada_obi')
    const dup = await register({ username: 'ADA_OBI', password: 'another long one' })
    expect(dup.status).toBe(409)
    expect(dup.body.error.code).toBe('username_taken')
  })

  test('concurrent sign-ups for one username create exactly one account', async () => {
    const results = await Promise.all([register(), register(), register()])
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409])
  })

  test('rejects bad usernames and weak passwords with a specific message', async () => {
    for (const body of [{ username: 'ab' }, { username: 'bad name!' }, { username: 'admin' }, { password: 'short' }, { password: 'password123' }, { password: 'xada_obix1234' }, { username: '' }]) {
      const r = await register(body)
      expect(r.status).toBe(400)
    }
    expect((await t.api('/api/auth/register', { body: { username: 'ok_name' } })).status).toBe(400)
    expect((await t.db.query('SELECT count(*)::int AS n FROM users')).rows[0].n).toBe(0)
  })
})

describe('sign in', () => {
  beforeEach(async () => {
    await register()
  })

  test('works with any letter case and returns the same account', async () => {
    const a = await login('ada_obi')
    const b = await login('  ADA_OBI ')
    expect(a.status).toBe(200)
    expect(b.body.user.id).toBe(a.body.user.id)
  })

  test('wrong password and unknown user get the identical error, so usernames cannot be probed', async () => {
    const wrong = await login('ada_obi', 'not the password')
    const unknown = await login('nobody_here', PW)
    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(wrong.body).toEqual(unknown.body)
    expect(wrong.body.error.code).toBe('invalid_credentials')
  })

  test('suspended accounts cannot sign in or keep using a session', async () => {
    const { token } = (await login()).body
    await t.db.query("UPDATE users SET is_banned = TRUE WHERE username = 'ada_obi'")
    expect((await login()).status).toBe(403)
    expect((await me(token)).status).toBe(403)
  })

  test('accounts that use Google have no password to guess', async () => {
    await t.api('/api/auth/google', { body: { credential: 'x'.repeat(30) } })
    expect((await login('ada', PW)).status).toBe(401)
    const hash = (await t.db.query("SELECT password_hash FROM users WHERE auth_provider = 'google'")).rows[0].password_hash
    expect(hash).toBeNull()
  })

  test('sign-in attempts are rate limited per account and per IP', async () => {
    const limited = await startTestApp('auth_rl', { realAuth: true, limits: { login: 3, auth: 100 } })
    await limited.api('/api/auth/register', { body: { username: 'victim', password: PW } })
    const codes: number[] = []
    for (let i = 0; i < 5; i++) codes.push((await limited.api('/api/auth/login', { body: { username: 'victim', password: `guess ${i} wrong` } })).status)
    expect(codes).toEqual([401, 401, 401, 429, 429])
    // the right password is also blocked while the window is hot, so guessing cannot continue
    expect((await limited.api('/api/auth/login', { body: { username: 'victim', password: PW } })).status).toBe(429)
    // a different account from the same IP is not locked out by that
    await limited.api('/api/auth/register', { body: { username: 'other_user', password: PW } })
    expect((await limited.api('/api/auth/login', { body: { username: 'other_user', password: PW } })).status).toBe(200)
    await limited.close()
  })

  test('sign-ups are rate limited per IP', async () => {
    const limited = await startTestApp('auth_rl2', { realAuth: true, limits: { register: 2, auth: 100 } })
    const codes: number[] = []
    for (let i = 0; i < 4; i++) codes.push((await limited.api('/api/auth/register', { body: { username: `user_${i}`, password: PW } })).status)
    await limited.close()
    expect(codes).toEqual([201, 201, 429, 429])
  })
})

describe('session tokens', () => {
  const secret = new TextEncoder().encode(DEV_AUTH_SECRET)
  const forge = (claims: Record<string, unknown>, opts: { iss?: string; aud?: string; exp?: string | number; key?: Uint8Array; sub?: string } = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(opts.sub ?? 'local:whatever')
      .setIssuer(opts.iss ?? 'roadwatch')
      .setAudience(opts.aud ?? 'roadwatch-web')
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? '1h')
      .sign(opts.key ?? secret)

  test('tokens are signed, expire, and cannot be forged or replayed for another service', async () => {
    const { token, user } = (await register()).body
    const uid = (await t.db.query('SELECT firebase_uid FROM users WHERE id = $1', [user.id])).rows[0].firebase_uid as string
    expect((await me(token)).status).toBe(200)

    const bad = [
      token.slice(0, -3) + (token.endsWith('abc') ? 'xyz' : 'abc'), // altered signature
      await forge({ tv: 0 }, { sub: uid, key: new TextEncoder().encode('another-secret-another-secret-another') }), // wrong key
      await forge({ tv: 0 }, { sub: uid, exp: Math.floor(Date.now() / 1000) - 60 }), // expired
      await forge({ tv: 0 }, { sub: uid, iss: 'someone-else' }),
      await forge({ tv: 0 }, { sub: uid, aud: 'another-app' }),
      await forge({ tv: 'zero' }, { sub: uid }), // malformed version
      `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: uid, tv: 0, iss: 'roadwatch', aud: 'roadwatch-web' })).toString('base64url')}.`, // alg none
    ]
    for (const b of bad) expect((await me(b)).status).toBe(401)
    // sanity: a correctly signed token for the same user is accepted
    expect((await me(await forge({ tv: 0 }, { sub: uid }))).status).toBe(200)
  })

  test('a valid token for an account that does not exist never creates one', async () => {
    const ghost = await forge({ tv: 0 }, { sub: 'local:ghost' })
    expect((await me(ghost)).status).toBe(401)
    expect((await t.db.query('SELECT count(*)::int AS n FROM users')).rows[0].n).toBe(0)
  })

  test('sessions last as long as configured', async () => {
    const svc = createTokenService(loadConfig({ NODE_ENV: 'test', SESSION_DAYS: '2' }))
    const payload = JSON.parse(Buffer.from((await svc.sign({ firebaseUid: 'local:x', tokenVersion: 0 })).split('.')[1], 'base64url').toString())
    expect(payload.exp - payload.iat).toBe(2 * 86400)
  })

  test('signing out everywhere revokes every existing token', async () => {
    await register()
    const a = (await login()).body.token as string
    const b = (await login()).body.token as string
    expect((await t.api('/api/auth/logout-all', { token: a, body: {} })).status).toBe(204)
    expect((await me(a)).status).toBe(401)
    expect((await me(b)).status).toBe(401)
    expect((await login()).status).toBe(200) // signing in again still works
  })

  test('changing the password needs the current one, enforces the rules, and signs out other devices', async () => {
    await register()
    const old = (await login()).body.token as string
    const change = (body: Record<string, string>, token = old) => t.api('/api/auth/password', { token, body })
    expect((await change({ currentPassword: 'wrong password!', newPassword: 'a brand new passphrase' })).status).toBe(401)
    expect((await change({ currentPassword: PW, newPassword: 'short' })).status).toBe(400)
    expect((await change({ currentPassword: PW, newPassword: PW })).status).toBe(400)
    const ok = await change({ currentPassword: PW, newPassword: 'a brand new passphrase' })
    expect(ok.status).toBe(200)
    expect((await me(old)).status).toBe(401) // other sessions are ended
    expect((await me(ok.body.token)).status).toBe(200) // this one continues with a fresh token
    expect((await login('ada_obi', PW)).status).toBe(401)
    expect((await login('ada_obi', 'a brand new passphrase')).status).toBe(200)
    expect((await t.api('/api/auth/password', { body: { currentPassword: PW, newPassword: 'whatever you like' } })).status).toBe(401)
  })

  test('Google accounts cannot set a password through the change form', async () => {
    const g = (await t.api('/api/auth/google', { body: { credential: 'x'.repeat(30) } })).body
    const r = await t.api('/api/auth/password', { token: g.token, body: { currentPassword: 'anything', newPassword: 'a brand new passphrase' } })
    expect(r.status).toBe(400)
    expect(r.body.error.message).toContain('Google')
  })

  test('deleting an account ends its session and frees the username', async () => {
    const { token } = (await register()).body
    expect((await t.api('/api/me', { token, method: 'DELETE' })).status).toBe(204)
    expect((await me(token)).status).toBe(401)
    expect((await login()).status).toBe(401)
    expect((await register()).status).toBe(201)
  })
})

describe('Google sign-in', () => {
  const sign = (body: unknown = { credential: 'x'.repeat(30) }) => t.api('/api/auth/google', { body })

  test('creates an account on first use and signs the same person in afterwards', async () => {
    const first = await sign()
    expect(first.status).toBe(200)
    expect(first.body.user).toMatchObject({ displayName: 'Ada Obi', email: 'ada@gmail.test', role: 'user' })
    expect((await me(first.body.token)).status).toBe(200)
    const again = await sign()
    expect(again.body.user.id).toBe(first.body.user.id)
    expect((await t.db.query('SELECT count(*)::int AS n FROM users')).rows[0].n).toBe(1)
    expect((await t.db.query("SELECT auth_provider FROM users")).rows[0].auth_provider).toBe('google')
  })

  test('a verified Google email listed in ADMIN_EMAILS becomes admin; an unlisted one does not', async () => {
    expect((await sign()).body.user.role).toBe('user')
    nextGoogle = { sub: 'g-2', email: 'admin@example.test', emailVerified: true, name: 'The Admin' }
    expect((await sign()).body.user.role).toBe('admin')
    nextGoogle = { sub: 'g-3', email: 'admin@example.test', emailVerified: false }
    expect((await sign()).status).toBe(401)
  })

  test('tokens Google rejects, or emails Google has not verified, are refused', async () => {
    nextGoogle = new Error('bad signature')
    const r = await sign()
    expect(r.status).toBe(401)
    expect(JSON.stringify(r.body)).not.toContain('bad signature')
    nextGoogle = { sub: 'g-9', email: 'e@gmail.test', emailVerified: false }
    expect((await sign()).status).toBe(401)
    expect((await t.db.query('SELECT count(*)::int AS n FROM users')).rows[0].n).toBe(0)
    expect((await sign({})).status).toBe(400)
  })

  test('a Google email does not take over a username account', async () => {
    await register()
    nextGoogle = { sub: 'g-5', email: 'ada_obi@gmail.test', emailVerified: true, name: 'ada_obi' }
    const g = await sign()
    expect(g.body.user.id).not.toBe((await login()).body.user.id)
  })

  test('is hidden when not configured, and the config endpoint says so', async () => {
    expect((await t.api('/api/auth/config')).body.googleClientId).toBeNull() // no GOOGLE_CLIENT_ID in the test config
    const withId = await startTestApp('auth_cfg', { realAuth: true, google, env: { GOOGLE_CLIENT_ID: 'abc123-client-id.apps.googleusercontent.com' } })
    expect((await withId.api('/api/auth/config')).body).toMatchObject({ googleClientId: 'abc123-client-id.apps.googleusercontent.com', passwordMin: 8 })
    await withId.close()
    const off = await startTestApp('auth_off', { realAuth: true })
    expect((await off.api('/api/auth/google', { body: { credential: 'x'.repeat(30) } })).status).toBe(503)
    await off.close()
  })
})
