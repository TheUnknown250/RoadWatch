import { useSyncExternalStore } from 'react'
import { api, ApiError } from './api'
import type { NewReport } from './types'

const KEY = 'roadwatch.reportQueue'
const EVENT = 'roadwatch:queue'

export interface QueuedReport {
  userId: number
  report: NewReport
  queuedAt: string
}

export function readQueue(): QueuedReport[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as QueuedReport[]
  } catch {
    return []
  }
}

function writeQueue(q: QueuedReport[]) {
  localStorage.setItem(KEY, JSON.stringify(q))
  window.dispatchEvent(new Event(EVENT))
}

export function enqueueReport(userId: number, report: NewReport) {
  const q = readQueue()
  // The idempotency key makes re-queuing the same form harmless.
  if (q.some((i) => i.report.idempotencyKey === report.idempotencyKey)) return
  writeQueue([...q, { userId, report, queuedAt: new Date().toISOString() }])
}

export interface FlushResult {
  sent: number
  rejected: number
  remaining: number
}

let flushing = false

/** Sends queued reports for this user. Safe to call repeatedly: retries reuse the idempotency key. */
export async function flushQueue(userId: number): Promise<FlushResult> {
  const result: FlushResult = { sent: 0, rejected: 0, remaining: 0 }
  if (flushing) return { ...result, remaining: readQueue().length }
  flushing = true
  try {
    for (const item of readQueue().filter((i) => i.userId === userId)) {
      try {
        await api('/incidents', { body: item.report })
        result.sent++
      } catch (err) {
        const e = err instanceof ApiError ? err : null
        // Transient problems keep the report queued; permanent 4xx errors drop it.
        const transient = !e || e.status === 0 || e.status >= 500 || e.status === 401 || e.status === 429
        if (transient) break
        result.rejected++
      }
      writeQueue(readQueue().filter((i) => i.report.idempotencyKey !== item.report.idempotencyKey))
    }
  } finally {
    flushing = false
  }
  result.remaining = readQueue().filter((i) => i.userId === userId).length
  return result
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb)
  window.addEventListener('storage', cb)
  return () => {
    window.removeEventListener(EVENT, cb)
    window.removeEventListener('storage', cb)
  }
}

let cached = { raw: '', count: 0 }
function snapshot(): number {
  const raw = localStorage.getItem(KEY) ?? '[]'
  if (raw !== cached.raw) cached = { raw, count: readQueue().length }
  return cached.count
}

export function useQueuedCount(): number {
  return useSyncExternalStore(subscribe, snapshot, () => 0)
}
