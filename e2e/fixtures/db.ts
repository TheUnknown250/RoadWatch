import fs from 'node:fs'
import pg from 'pg'
import { loadConfig } from '../../server/config'
import { createPool } from '../../server/db/pool'

// Ensure .env is read in Node context
if (fs.existsSync('.env')) {
  const content = fs.readFileSync('.env', 'utf8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed.slice(eq + 1).trim()
      if (!process.env[key]) process.env[key] = val
    }
  }
}

let pool: pg.Pool | null = null

export function getDb(): pg.Pool {
  if (!pool) {
    const config = loadConfig()
    pool = createPool(config.DATABASE_URL, config.DATABASE_SSL)
  }
  return pool
}

export function randomUsername(prefix = 'u'): string {
  // RoadWatch requires 3 to 20 chars
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${rand}`
}

export async function cleanupTestData() {
  const db = getDb()
  await db.query(`
    DELETE FROM incidents WHERE title LIKE 'E2E Test%';
    DELETE FROM users WHERE username LIKE 'u_%' OR username LIKE 'e2e_%' OR username LIKE 'bad_%';
  `)
}

export async function createE2eUser(opts: {
  username?: string
  password?: string
  displayName?: string
  role?: 'user' | 'moderator' | 'admin'
} = {}) {
  const db = getDb()
  const username = opts.username ?? randomUsername('e2e')
  const password = opts.password ?? 'ValidPass1234!'
  const displayName = opts.displayName ?? username

  const res = await fetch('http://localhost:3001/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password, displayName }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to create test user: ${res.status} ${text}`)
  }

  const data = (await res.json()) as { token: string; user?: unknown }

  if (opts.role && opts.role !== 'user') {
    await db.query('UPDATE users SET role = $1 WHERE username = $2', [opts.role, username])
  }

  return { ...data, username, password, displayName }
}
