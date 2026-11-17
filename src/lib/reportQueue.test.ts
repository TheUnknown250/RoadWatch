import { beforeEach, describe, expect, test } from 'bun:test'
import { setTokenGetter } from './api'
import { enqueueReport, flushQueue, readQueue } from './reportQueue'
import type { NewReport } from './types'

const store = new Map<string, string>()
const g = globalThis as unknown as Record<string, unknown>
g.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
}
g.window = Object.assign(new EventTarget(), { dispatchEvent: (e: Event) => EventTarget.prototype.dispatchEvent.call(g.window, e) })

const report = (key: string): NewReport => ({
  categorySlug: 'accident', title: 'Test report', description: 'A test description', latitude: 6.5, longitude: 3.4,
  occurredAt: new Date().toISOString(), idempotencyKey: key,
})

const realFetch = globalThis.fetch
beforeEach(() => {
  store.clear()
  globalThis.fetch = realFetch
  setTokenGetter(() => Promise.resolve('tok'))
})

describe('offline report queue', () => {
  test('queues once per idempotency key', () => {
    enqueueReport(1, report('a'))
    enqueueReport(1, report('a'))
    expect(readQueue()).toHaveLength(1)
  })

  test('sends queued reports and clears them', async () => {
    enqueueReport(1, report('a'))
    enqueueReport(1, report('b'))
    globalThis.fetch = () => Promise.resolve(new Response('{"incident":{}}', { status: 201 }))
    const r = await flushQueue(1)
    expect(r).toEqual({ sent: 2, rejected: 0, remaining: 0 })
    expect(readQueue()).toHaveLength(0)
  })

  test('keeps reports when still offline', async () => {
    enqueueReport(1, report('a'))
    globalThis.fetch = () => Promise.reject(new TypeError('offline'))
    const r = await flushQueue(1)
    expect(r.sent).toBe(0)
    expect(r.remaining).toBe(1)
  })

  test('drops reports the server permanently rejects', async () => {
    enqueueReport(1, report('a'))
    globalThis.fetch = () => Promise.resolve(new Response('{"error":{"code":"validation_failed","message":"bad"}}', { status: 400 }))
    const r = await flushQueue(1)
    expect(r).toEqual({ sent: 0, rejected: 1, remaining: 0 })
  })

  test('never sends another user\'s queued reports', async () => {
    enqueueReport(2, report('a'))
    let calls = 0
    globalThis.fetch = () => { calls++; return Promise.resolve(new Response('{}', { status: 201 })) }
    await flushQueue(1)
    expect(calls).toBe(0)
    expect(readQueue()).toHaveLength(1)
  })
})
