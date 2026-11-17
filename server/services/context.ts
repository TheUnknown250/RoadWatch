import type { Config } from '../config'
import type { Db } from '../db/pool'

export interface IncidentEvent {
  id: number
  kind: 'created' | 'updated'
  status: string
  confirmCount: number
  flagCount: number
  updatedAt: string
}

export interface PushPayload {
  title: string
  body: string
  incidentId?: number
}

/**
 * Best-effort delivery channels (Firestore mirror, FCM). PostgreSQL is always
 * written first; failures here never roll back or fail a request.
 */
export interface Realtime {
  incidentChanged(event: IncidentEvent): Promise<void>
  push(userIds: number[], payload: PushPayload): Promise<void>
}

export const noopRealtime: Realtime = {
  async incidentChanged() {},
  async push() {},
}

export interface Ctx {
  db: Db
  config: Config
  realtime: Realtime
}

export async function bestEffort(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
  } catch (err) {
    console.error(`${label} failed:`, err instanceof Error ? err.message : err)
  }
}
