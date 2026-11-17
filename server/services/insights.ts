import type { Db } from '../db/pool'

// Rejected and withdrawn reports never count toward public statistics.
const COUNTED = `i.status NOT IN ('rejected', 'withdrawn')`

export async function summary(db: Db, days: number) {
  const since = `i.occurred_at >= now() - make_interval(days => $1)`
  const [totals, byCategory, byState, trend] = await Promise.all([
    db.query<{ total: number; verified: number; open: number }>(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE i.status = 'verified')::int AS verified,
              count(*) FILTER (WHERE i.status IN ('pending', 'verified', 'disputed') AND i.expires_at > now())::int AS open
         FROM incidents i WHERE ${COUNTED} AND ${since}`,
      [days],
    ),
    db.query<{ slug: string; name: string; severity: number; n: number }>(
      `SELECT c.slug, c.name, c.severity_default AS severity, count(i.id)::int AS n
         FROM categories c LEFT JOIN incidents i ON i.category_id = c.id AND ${COUNTED} AND ${since}
        GROUP BY c.id ORDER BY n DESC, c.id`,
      [days],
    ),
    db.query<{ state: string; n: number }>(
      `SELECT i.state, count(*)::int AS n FROM incidents i
        WHERE ${COUNTED} AND ${since} AND i.state IS NOT NULL GROUP BY i.state ORDER BY n DESC, i.state LIMIT 10`,
      [days],
    ),
    db.query<{ day: Date; n: number }>(
      `SELECT d::date AS day, count(i.id)::int AS n
         FROM generate_series((now() - make_interval(days => $1 - 1))::date, now()::date, '1 day') d
         LEFT JOIN incidents i ON i.occurred_at::date = d::date AND ${COUNTED}
        GROUP BY d ORDER BY d`,
      [days],
    ),
  ])
  return {
    days,
    total: totals.rows[0].total,
    verified: totals.rows[0].verified,
    open: totals.rows[0].open,
    byCategory: byCategory.rows,
    byState: byState.rows,
    trend: trend.rows.map((r) => ({ day: r.day.toISOString().slice(0, 10), n: r.n })),
  }
}

/** Groups reports into ~5 km cells. Cells with a single report are not shown as hotspots. */
export async function hotspots(db: Db, days: number) {
  const { rows } = await db.query<{ lat: number; lng: number; n: number; score: number; top: string }>(
    `SELECT ST_Y(ST_Centroid(ST_Collect(i.location::geometry))) AS lat,
            ST_X(ST_Centroid(ST_Collect(i.location::geometry))) AS lng,
            count(*)::int AS n,
            sum(c.severity_default)::int AS score,
            (array_agg(c.name ORDER BY c.severity_default DESC))[1] AS top
       FROM incidents i JOIN categories c ON c.id = i.category_id
      WHERE ${COUNTED} AND i.occurred_at >= now() - make_interval(days => $1)
      GROUP BY ST_SnapToGrid(i.location::geometry, 0.05)
     HAVING count(*) >= 2
      ORDER BY score DESC LIMIT 50`,
    [days],
  )
  return rows.map((r) => ({ latitude: r.lat, longitude: r.lng, count: r.n, score: r.score, topCategory: r.top }))
}
