import { beforeEach, describe, expect, test } from 'bun:test'
import { filtersToQuery } from '@/hooks/useIncidents'
import { api, ApiError, errorMessage, setTokenGetter } from './api'
import { formatClock, formatDistance, formatDuration, formatKm, timeAgo, toLocalInput } from './format'
import { insideNigeria } from './nigeria'
import { EMPTY_FILTERS } from './types'

describe('format helpers', () => {
  const now = new Date('2026-11-09T12:00:00Z').getTime()
  test('timeAgo', () => {
    expect(timeAgo('2026-11-09T11:59:50Z', now)).toBe('just now')
    expect(timeAgo('2026-11-09T11:30:00Z', now)).toBe('30 min ago')
    expect(timeAgo('2026-11-09T09:00:00Z', now)).toBe('3 h ago')
    expect(timeAgo('2026-11-07T12:00:00Z', now)).toBe('2 d ago')
  })
  test('formatDistance', () => {
    expect(formatDistance(850)).toBe('850 m')
    expect(formatDistance(12_340)).toBe('12.3 km')
  })
  test('toLocalInput pads fields', () => {
    expect(toLocalInput(new Date(2026, 0, 5, 7, 3))).toBe('2026-01-05T07:03')
  })
})

describe('trip formatting', () => {
  test('durations and distances read naturally', () => {
    expect(formatDuration(20)).toBe('1 min')
    expect(formatDuration(25 * 60)).toBe('25 min')
    expect(formatDuration(95 * 60)).toBe('1 h 35 min')
    expect(formatKm(450)).toBe('450 m')
    expect(formatKm(1500)).toBe('1.5 km')
    expect(formatKm(15245)).toBe('15 km')
  })
  test('clock times are shown in West Africa Time', () => {
    expect(formatClock('2026-11-09T06:30:00Z')).toBe('07:30')
  })
})

describe('Nigeria bounds', () => {
  test('accepts Nigerian cities and rejects other places', () => {
    expect(insideNigeria(6.5244, 3.3792)).toBe(true) // Lagos
    expect(insideNigeria(9.0765, 7.3986)).toBe(true) // Abuja
    expect(insideNigeria(51.5, -0.12)).toBe(false) // London
    expect(insideNigeria(5.6, -0.2)).toBe(false) // Accra
  })
})

describe('filtersToQuery', () => {
  test('encodes only the active filters', () => {
    expect(filtersToQuery(EMPTY_FILTERS)).toBe('limit=200')
    const qs = new URLSearchParams(
      filtersToQuery({ q: ' lagos ', categories: ['accident', 'flooding'], statuses: ['verified'], from: '2026-11-01', to: '2026-11-09', near: { lat: 6.5, lng: 3.4, radiusKm: 25 } }),
    )
    expect(qs.get('q')).toBe('lagos')
    expect(qs.get('category')).toBe('accident,flooding')
    expect(qs.get('status')).toBe('verified')
    expect(qs.get('lat')).toBe('6.5')
    expect(qs.get('radiusKm')).toBe('25')
    expect(new Date(qs.get('to')!).getTime()).toBeGreaterThan(new Date(qs.get('from')!).getTime())
  })
})

describe('api client', () => {
  const realFetch = globalThis.fetch
  beforeEach(() => {
    globalThis.fetch = realFetch
    setTokenGetter(() => Promise.resolve('tok'))
  })

  test('sends the bearer token and parses errors', async () => {
    let auth = ''
    globalThis.fetch = ((_: unknown, init: RequestInit) => {
      auth = (init.headers as Record<string, string>).authorization
      return Promise.resolve(new Response(JSON.stringify({ error: { code: 'forbidden', message: 'Nope' } }), { status: 403 }))
    }) as unknown as typeof fetch
    const err = await api('/x').catch((e: unknown) => e)
    expect(auth).toBe('Bearer tok')
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).code).toBe('forbidden')
  })

  test('network failure becomes an offline error', async () => {
    globalThis.fetch = () => Promise.reject(new TypeError('fetch failed'))
    const err = (await api('/x', { auth: false }).catch((e: unknown) => e)) as ApiError
    expect(err.isOffline).toBe(true)
  })

  test('errorMessage includes validation details', () => {
    const e = new ApiError(400, 'validation_failed', 'Some fields are invalid', [{ path: 'title', message: 'Too short' }])
    expect(errorMessage(e)).toBe('title: Too short')
    expect(errorMessage(new Error('boom'))).toBe('boom')
  })
})
