import type { Db } from '../db/pool'

export interface IncidentFilters {
  bbox?: [number, number, number, number] // west, south, east, north
  near?: { lat: number; lng: number; radiusM: number }
  categories?: string[]
  statuses?: string[]
  from?: Date
  to?: Date
  q?: string
  reporterId?: number
  limit: number
  offset: number
}

export interface Viewer {
  id: number
  role: 'user' | 'moderator' | 'admin'
}

export interface IncidentDto {
  id: number
  title: string
  description: string
  addressText: string | null
  state: string | null
  status: string
  occurredAt: string
  createdAt: string
  updatedAt: string
  expiresAt: string
  confirmCount: number
  flagCount: number
  latitude: number
  longitude: number
  category: { slug: string; name: string; severity: number }
  /** The real reporter for the owner and moderators; id 0 and "Anonymous" for everyone else on anonymous reports. */
  reporter: { id: number; displayName: string }
  isAnonymous: boolean
  myVote: 'confirm' | 'flag' | null
  distanceM?: number
}

interface Row {
  id: string
  title: string
  description: string
  address_text: string | null
  state: string | null
  status: string
  occurred_at: Date
  created_at: Date
  updated_at: Date
  expires_at: Date
  confirm_count: number
  flag_count: number
  lat: number
  lng: number
  category_slug: string
  category_name: string
  severity: number
  reporter_id: string
  reporter_name: string
  is_anonymous: boolean
  my_vote: 'confirm' | 'flag' | null
  distance_m: number | null
}

export const DEFAULT_STATUSES = ['pending', 'verified', 'disputed']
export const HIDDEN_STATUSES = ['rejected', 'withdrawn']

const BASE = `
  SELECT i.id, i.title, i.description, i.address_text, i.state, i.status, i.occurred_at, i.created_at,
         i.updated_at, i.expires_at, i.confirm_count, i.flag_count,
         ST_Y(i.location::geometry) AS lat, ST_X(i.location::geometry) AS lng,
         c.slug AS category_slug, c.name AS category_name, c.severity_default AS severity,
         i.reporter_id, u.display_name AS reporter_name, i.is_anonymous,
         v.vote AS my_vote, %DIST% AS distance_m
    FROM incidents i
    JOIN categories c ON c.id = i.category_id
    JOIN users u ON u.id = i.reporter_id
    LEFT JOIN verifications v ON v.incident_id = i.id AND v.user_id = $1`

export function toDto(r: Row, viewer?: Viewer): IncidentDto {
  const sees = viewer && (viewer.role !== 'user' || viewer.id === Number(r.reporter_id))
  const hide = r.is_anonymous && !sees
  return {
    id: Number(r.id),
    title: r.title,
    description: r.description,
    addressText: r.address_text,
    state: r.state,
    status: r.status,
    occurredAt: r.occurred_at.toISOString(),
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    expiresAt: r.expires_at.toISOString(),
    confirmCount: r.confirm_count,
    flagCount: r.flag_count,
    latitude: r.lat,
    longitude: r.lng,
    category: { slug: r.category_slug, name: r.category_name, severity: r.severity },
    reporter: hide ? { id: 0, displayName: 'Anonymous' } : { id: Number(r.reporter_id), displayName: r.reporter_name },
    isAnonymous: r.is_anonymous,
    myVote: r.my_vote,
    ...(r.distance_m != null ? { distanceM: Math.round(r.distance_m) } : {}),
  }
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`)

export async function listIncidents(db: Db, f: IncidentFilters, viewer?: Viewer): Promise<IncidentDto[]> {
  const params: unknown[] = [viewer?.id ?? null]
  const where: string[] = []
  const p = (v: unknown) => {
    params.push(v)
    return `$${params.length}`
  }
  const isMod = viewer?.role === 'moderator' || viewer?.role === 'admin'

  let dist = 'NULL::float8'
  if (f.near) {
    const pt = `ST_SetSRID(ST_MakePoint(${p(f.near.lng)}, ${p(f.near.lat)}), 4326)::geography`
    dist = `ST_Distance(i.location, ${pt})`
    where.push(`ST_DWithin(i.location, ${pt}, ${p(f.near.radiusM)})`)
  }
  if (f.bbox) {
    where.push(`i.location::geometry && ST_MakeEnvelope(${p(f.bbox[0])}, ${p(f.bbox[1])}, ${p(f.bbox[2])}, ${p(f.bbox[3])}, 4326)`)
  }
  if (f.categories?.length) where.push(`c.slug = ANY(${p(f.categories)})`)
  if (f.statuses?.length) {
    // Rejected and withdrawn reports are private to moderators and to the reporter's own listing.
    const seesAll = isMod || (viewer !== undefined && f.reporterId === viewer.id)
    const allowed = seesAll ? f.statuses : f.statuses.filter((s) => !HIDDEN_STATUSES.includes(s))
    where.push(`i.status = ANY(${p(allowed)})`)
  } else {
    where.push(`i.status = ANY(${p(DEFAULT_STATUSES)}) AND i.expires_at > now()`)
  }
  if (f.from) where.push(`i.occurred_at >= ${p(f.from)}`)
  if (f.to) where.push(`i.occurred_at <= ${p(f.to)}`)
  if (f.reporterId) where.push(`i.reporter_id = ${p(f.reporterId)}`)
  if (f.q) {
    const like = p(`%${escapeLike(f.q)}%`)
    where.push(`(i.title ILIKE ${like} OR i.description ILIKE ${like} OR i.address_text ILIKE ${like} OR i.state ILIKE ${like})`)
  }

  const sql =
    BASE.replace('%DIST%', dist) +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ` ORDER BY ${f.near ? 'distance_m ASC,' : ''} i.created_at DESC, i.id DESC LIMIT ${p(f.limit)} OFFSET ${p(f.offset)}`
  const { rows } = await db.query<Row>(sql, params)
  return rows.map((r) => toDto(r, viewer))
}

export async function getIncident(db: Db, id: number, viewer?: Viewer): Promise<IncidentDto | null> {
  const { rows } = await db.query<Row>(`${BASE.replace('%DIST%', 'NULL::float8')} WHERE i.id = $2`, [viewer?.id ?? null, id])
  if (!rows[0]) return null
  const isMod = viewer?.role === 'moderator' || viewer?.role === 'admin'
  // Rejected and withdrawn reports are visible only to their reporter and moderators.
  if (HIDDEN_STATUSES.includes(rows[0].status) && !isMod && Number(rows[0].reporter_id) !== viewer?.id) return null
  return toDto(rows[0], viewer)
}
