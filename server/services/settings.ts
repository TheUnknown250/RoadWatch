import type { Db } from '../db/pool'
import type { RoutePrefs } from './planner'

export interface UserSettings extends RoutePrefs {
  tripSuggestions: boolean
  shareSosWithCommunities: boolean
}

interface Row {
  trip_suggestions: boolean
  avoid_tolls: boolean
  avoid_motorways: boolean
  avoid_ferries: boolean
  prefer_safest: boolean
  share_sos_with_communities: boolean
}

const toSettings = (r: Row): UserSettings => ({
  tripSuggestions: r.trip_suggestions,
  avoidTolls: r.avoid_tolls,
  avoidMotorways: r.avoid_motorways,
  avoidFerries: r.avoid_ferries,
  preferSafest: r.prefer_safest,
  shareSosWithCommunities: r.share_sos_with_communities,
})

const COLUMNS = {
  tripSuggestions: 'trip_suggestions',
  avoidTolls: 'avoid_tolls',
  avoidMotorways: 'avoid_motorways',
  avoidFerries: 'avoid_ferries',
  preferSafest: 'prefer_safest',
  shareSosWithCommunities: 'share_sos_with_communities',
} as const

export async function getSettings(db: Db, userId: number): Promise<UserSettings> {
  await db.query('INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId])
  const { rows } = await db.query<Row>('SELECT * FROM user_settings WHERE user_id = $1', [userId])
  return toSettings(rows[0])
}

export async function updateSettings(db: Db, userId: number, patch: Partial<UserSettings>): Promise<UserSettings> {
  await getSettings(db, userId)
  const keys = (Object.keys(patch) as (keyof UserSettings)[]).filter((k) => patch[k] !== undefined)
  if (keys.length) {
    // Column names come from the fixed map above, never from client input.
    const sets = keys.map((k, i) => `${COLUMNS[k]} = $${i + 2}`).join(', ')
    await db.query(`UPDATE user_settings SET ${sets}, updated_at = now() WHERE user_id = $1`, [userId, ...keys.map((k) => patch[k])])
  }
  return getSettings(db, userId)
}
