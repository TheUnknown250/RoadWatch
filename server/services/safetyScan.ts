import type { Db } from '../db/pool'
import { CATEGORY_ADVICE, GENERAL_ADVICE } from './advice'

export type ScanLevel = 'safe' | 'caution' | 'elevated' | 'danger'
export type Confidence = 'none' | 'low' | 'medium' | 'high'

export interface ScanInput {
  status: string
  severity: number
  ageDays: number
  distanceM: number
}

/** How much a report counts, by how trustworthy and relevant its status is. */
const STATUS_WEIGHT: Record<string, number> = { verified: 1, pending: 0.6, disputed: 0.25, resolved: 0.35, expired: 0.5 }
const HALF_LIFE_DAYS = 7
const SCORE_SCALE = 8

/** Risk points of one report: severity x status weight x recency decay x closeness. */
export function riskPoints(i: ScanInput, radiusM: number): number {
  const recency = Math.pow(0.5, i.ageDays / HALF_LIFE_DAYS)
  const closeness = 1 - 0.5 * Math.min(1, i.distanceM / radiusM)
  return i.severity * (STATUS_WEIGHT[i.status] ?? 0.5) * recency * closeness
}

/** 100 means nothing worrying was reported; the score falls as weighted risk grows. */
export function scoreFromRisk(risk: number): number {
  return Math.round(100 * Math.exp(-risk / SCORE_SCALE))
}

export function levelFor(score: number): ScanLevel {
  if (score >= 80) return 'safe'
  if (score >= 60) return 'caution'
  if (score >= 40) return 'elevated'
  return 'danger'
}

export function confidenceFor(count: number): Confidence {
  if (count === 0) return 'none'
  if (count < 3) return 'low'
  if (count < 10) return 'medium'
  return 'high'
}

interface Row {
  id: string
  title: string
  status: string
  slug: string
  name: string
  severity: number
  occurred_at: Date
  age_days: number
  distance_m: number
}

export async function safetyScan(db: Db, lat: number, lng: number, radiusKm: number, days: number) {
  const radiusM = radiusKm * 1000
  const { rows } = await db.query<Row>(
    `SELECT i.id, i.title, i.status, c.slug, c.name, c.severity_default AS severity, i.occurred_at,
            extract(epoch FROM (now() - i.occurred_at)) / 86400 AS age_days,
            ST_Distance(i.location, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) AS distance_m
       FROM incidents i JOIN categories c ON c.id = i.category_id
      WHERE i.status NOT IN ('rejected', 'withdrawn')
        AND i.occurred_at >= now() - make_interval(days => $4)
        AND ST_DWithin(i.location, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $3)
      ORDER BY i.occurred_at DESC`,
    [lat, lng, radiusM, days],
  )

  let risk = 0
  const byCat = new Map<string, { slug: string; name: string; n: number; risk: number }>()
  for (const r of rows) {
    const pts = riskPoints({ status: r.status, severity: r.severity, ageDays: Number(r.age_days), distanceM: Number(r.distance_m) }, radiusM)
    risk += pts
    const c = byCat.get(r.slug) ?? { slug: r.slug, name: r.name, n: 0, risk: 0 }
    c.n++
    c.risk += pts
    byCat.set(r.slug, c)
  }
  const score = rows.length === 0 ? 100 : scoreFromRisk(risk)
  const level = levelFor(score)
  const confidence = confidenceFor(rows.length)
  const threats = [...byCat.values()].sort((a, b) => b.risk - a.risk).slice(0, 4)

  return {
    score,
    level,
    confidence,
    radiusKm,
    days,
    total: rows.length,
    threats: threats.map((t) => ({ slug: t.slug, name: t.name, n: t.n, advice: CATEGORY_ADVICE[t.slug] ?? CATEGORY_ADVICE.other })),
    advice: confidence === 'none' ? [...GENERAL_ADVICE.none] : [...GENERAL_ADVICE[level]],
    recent: rows.slice(0, 5).map((r) => ({ id: Number(r.id), title: r.title, status: r.status, category: r.name, occurredAt: r.occurred_at.toISOString() })),
    method:
      'Each report adds risk points: category severity x status weight (verified counts most) x recency (halves every 7 days) x closeness. The score is 100 x e^(-risk/8).',
  }
}
