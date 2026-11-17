import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { sslOption } from '../db/pool'
import { loadConfig } from '../config'
import { reportBody, startTestApp, tokenFor } from './helpers'

const t = await startTestApp('security')
afterAll(() => t.close())
beforeEach(() => t.db.query('TRUNCATE users, incidents, verifications, incident_status_history, notifications, area_subscriptions RESTART IDENTITY CASCADE'))

describe('HTTP hardening', () => {
  test('sets security headers and hides the framework', async () => {
    const res = await fetch(`${t.base}/api/health`)
    expect(res.headers.get('x-powered-by')).toBeNull()
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-security-policy')).toBeTruthy()
    expect(res.headers.get('ratelimit') ?? res.headers.get('ratelimit-policy')).toBeTruthy()
  })

  test('oversized bodies are refused cleanly', async () => {
    const r = await t.api('/api/incidents', { as: 'alice', body: reportBody({ description: 'x'.repeat(40_000) }) })
    expect(r.status).toBe(413)
    expect(r.body.error.code).toBe('payload_too_large')
  })

  test('unknown routes return JSON 404 without internals', async () => {
    const r = await t.api('/api/does-not-exist', { as: 'alice' })
    expect([401, 404]).toContain(r.status)
    expect(JSON.stringify(r.body)).not.toContain('node_modules')
  })

  test('SQL metacharacters in search and filters are treated as data', async () => {
    await t.api('/api/incidents', { as: 'alice', body: reportBody() })
    const q = encodeURIComponent("'; DROP TABLE incidents; --")
    expect((await t.api(`/api/incidents?q=${q}`)).body.incidents).toHaveLength(0)
    expect((await t.api(`/api/incidents?category=${q}`)).body.incidents).toHaveLength(0)
    const injected = await t.api('/api/incidents', { as: 'alice', body: reportBody({ title: "Robert'); DROP TABLE users;--", latitude: 7 }) })
    expect(injected.status).toBe(201)
    expect((await t.db.query('SELECT count(*)::int AS n FROM incidents')).rows[0].n).toBe(2)
  })

  test('internal errors do not leak details', async () => {
    const original = t.db.query.bind(t.db)
    ;(t.db as unknown as { query: unknown }).query = () => Promise.reject(new Error('password authentication failed for user "secret"'))
    const r = await t.api('/api/categories')
    ;(t.db as unknown as { query: unknown }).query = original
    expect(r.status).toBe(500)
    expect(JSON.stringify(r.body)).not.toContain('secret')
  })
})

describe('authentication', () => {
  test('garbage, malformed and wrong-scheme tokens are rejected', async () => {
    for (const h of ['Bearer', 'Bearer garbage', 'Basic abc', `Bearer ${tokenFor('x').replace('test', 'evil')}`]) {
      const res = await fetch(`${t.base}/api/me`, { headers: { authorization: h } })
      expect(res.status).toBe(401)
    }
  })

  test('public routes treat a bad token as anonymous instead of failing', async () => {
    const res = await fetch(`${t.base}/api/incidents`, { headers: { authorization: 'Bearer garbage' } })
    expect(res.status).toBe(200)
  })

  test('production refuses to start without a strong AUTH_SECRET', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/AUTH_SECRET/)
    expect(() => loadConfig({ NODE_ENV: 'production', AUTH_SECRET: 'too-short' })).toThrow()
    expect(loadConfig({ NODE_ENV: 'production', AUTH_SECRET: 'x'.repeat(32) }).AUTH_SECRET).toHaveLength(32)
  })

  test('old development-style tokens are not accepted by the real verifier', async () => {
    const real = await startTestApp('security_real', { realAuth: true })
    for (const token of ['dev:eve:eve@x.test', tokenFor('eve'), 'Bearer nope']) {
      expect((await real.api('/api/me', { token })).status).toBe(401)
    }
    await real.close()
  })

  test('a dev-style email cannot self-promote to admin without a verified admin email', async () => {
    // role is only ever set from ADMIN_EMAILS on a verified email, never from client input
    const res = await t.api('/api/me', { as: 'mallory', method: 'PATCH', body: { displayName: 'Mallory', role: 'admin' } })
    expect(res.status).toBe(200)
    expect((await t.api('/api/me', { as: 'mallory' })).body.user.role).toBe('user')
  })

  test('users cannot touch each other\'s subscriptions', async () => {
    await t.api('/api/me', { as: 'u1' })
    const sub = await t.api('/api/me/subscriptions', { as: 'u1', body: { latitude: 6.5, longitude: 3.4, radiusKm: 5 } })
    const del = await t.api(`/api/me/subscriptions/${sub.body.id}`, { as: 'u2', method: 'DELETE' })
    expect(del.status).toBe(404)
  })
})

describe('deployment settings', () => {
  test('database SSL modes map to the pg option', () => {
    expect(sslOption('off')).toBeUndefined()
    expect(sslOption('require')).toEqual({ rejectUnauthorized: false })
    expect(sslOption('verify')).toBe(true)
  })

  test('hosting defaults', () => {
    const c = loadConfig({})
    expect(c.DATABASE_SSL).toBe('off')
    expect(c.TRUST_PROXY).toBe(1)
    expect(loadConfig({ DATABASE_SSL: 'require', TRUST_PROXY: '2' }).TRUST_PROXY).toBe(2)
    expect(() => loadConfig({ DATABASE_SSL: 'maybe' })).toThrow()
  })
})
