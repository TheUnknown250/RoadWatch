import type pg from 'pg'
import type { Config } from '../config'

export const STATUSES = ['pending', 'verified', 'disputed', 'resolved', 'rejected', 'expired', 'withdrawn'] as const
export type Status = (typeof STATUSES)[number]

/** Statuses a moderator may set. `withdrawn` belongs to the reporter and `expired` to the system. */
export const MODERATOR_STATUSES = ['verified', 'disputed', 'resolved', 'rejected'] as const

/** Statuses the community vote can move between. Others are terminal or moderator-owned. */
const VOTABLE: Status[] = ['pending', 'verified', 'disputed']

export function isVotable(status: string): boolean {
  return (VOTABLE as string[]).includes(status)
}

/** Pure community-verification rule. Ties and low counts leave a report pending. */
export function nextStatus(
  current: Status,
  confirms: number,
  flags: number,
  thresholds: Pick<Config, 'VERIFY_CONFIRM_THRESHOLD' | 'VERIFY_FLAG_THRESHOLD'>,
): Status {
  if (!VOTABLE.includes(current)) return current
  if (confirms >= thresholds.VERIFY_CONFIRM_THRESHOLD && confirms > flags) return 'verified'
  if (flags >= thresholds.VERIFY_FLAG_THRESHOLD && flags > confirms) return 'disputed'
  return 'pending'
}

export interface Transition {
  incidentId: number
  reporterId: number
  from: Status
  to: Status
  changedBy: number | null
  reason?: string
  moderated?: boolean
}

const NOTIFY_COPY: Partial<Record<Status, { type: string; title: string; body: string }>> = {
  verified: { type: 'report_verified', title: 'Your report was verified', body: 'The community confirmed your report.' },
  disputed: { type: 'report_disputed', title: 'Your report was disputed', body: 'Other users flagged your report.' },
  resolved: { type: 'status_changed', title: 'Your report was resolved', body: 'A moderator marked this incident resolved.' },
  rejected: { type: 'status_changed', title: 'Your report was rejected', body: 'A moderator rejected this report.' },
}

/** Writes the new status, its history row and (for the reporter) a notification. Call inside a transaction. */
export async function applyTransition(client: pg.PoolClient, t: Transition): Promise<number[]> {
  await client.query(
    `UPDATE incidents SET status = $2, updated_at = now(), moderated = moderated OR $3 WHERE id = $1`,
    [t.incidentId, t.to, Boolean(t.moderated)],
  )
  await client.query(
    `INSERT INTO incident_status_history (incident_id, from_status, to_status, changed_by, reason)
     VALUES ($1, $2, $3, $4, $5)`,
    [t.incidentId, t.from, t.to, t.changedBy, t.reason ?? null],
  )
  if (t.to === 'verified') {
    await client.query('UPDATE users SET reputation = reputation + 1 WHERE id = $1', [t.reporterId])
  }
  const copy = NOTIFY_COPY[t.to]
  if (!copy || t.changedBy === t.reporterId) return []
  await client.query(
    `INSERT INTO notifications (user_id, incident_id, type, title, body) VALUES ($1, $2, $3, $4, $5)`,
    [t.reporterId, t.incidentId, copy.type, copy.title, copy.body],
  )
  return [t.reporterId]
}
