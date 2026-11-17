import { loadConfig } from '../config'
import { createPool } from '../db/pool'
import { normalizeUsername } from '../services/localAuth'

// Usage: bun run admin:promote <username|email> [admin|moderator|user]
const [who, role = 'admin'] = process.argv.slice(2)
if (!who || !['admin', 'moderator', 'user'].includes(role)) {
  console.error('Usage: bun run admin:promote <username|email> [admin|moderator|user]')
  process.exit(1)
}

const db = createPool(loadConfig().DATABASE_URL, loadConfig().DATABASE_SSL)
const key = who.includes('@') ? who.trim().toLowerCase() : normalizeUsername(who)
const res = await db.query(
  `UPDATE users SET role = $2 WHERE ${who.includes('@') ? 'lower(email)' : 'username'} = $1 AND NOT is_banned RETURNING id, display_name`,
  [key, role],
)
console.log(res.rowCount ? `${res.rows[0].display_name} is now ${role}.` : `No active account found for "${who}".`)
await db.end()
process.exit(res.rowCount ? 0 : 1)
