import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import type { Category, Incident, IncidentFilters, StatusHistoryEntry } from '@/lib/types'

export interface IncidentList {
  incidents: Incident[]
  /** When this data was fetched from the server. */
  fetchedAt: string
  /** True when the server could not be reached and saved data is shown instead. */
  stale: boolean
}

const CACHE_PREFIX = 'roadwatch.cache.'

export function readCache<T>(key: string): { data: T; at: string } | null {
  try {
    return JSON.parse(localStorage.getItem(CACHE_PREFIX + key) ?? 'null') as { data: T; at: string } | null
  } catch {
    return null
  }
}

export function writeCache(key: string, data: unknown, at: string) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, at }))
  } catch {
    // Storage may be full or blocked; offline fallback is best-effort.
  }
}

export function filtersToQuery(f: IncidentFilters): string {
  const p = new URLSearchParams()
  if (f.q.trim()) p.set('q', f.q.trim())
  if (f.categories.length) p.set('category', f.categories.join(','))
  if (f.statuses.length) p.set('status', f.statuses.join(','))
  if (f.from) p.set('from', new Date(f.from).toISOString())
  if (f.to) p.set('to', new Date(`${f.to}T23:59:59`).toISOString())
  if (f.near) {
    p.set('lat', String(f.near.lat))
    p.set('lng', String(f.near.lng))
    p.set('radiusKm', String(f.near.radiusKm))
  }
  p.set('limit', '200')
  return p.toString()
}

export function useIncidents(filters: IncidentFilters, pollMs: number | false) {
  const qs = filtersToQuery(filters)
  return useQuery<IncidentList>({
    queryKey: ['incidents', qs],
    networkMode: 'always',
    refetchInterval: pollMs,
    queryFn: async ({ signal }) => {
      try {
        const res = await api<{ incidents: Incident[]; serverTime: string }>(`/incidents?${qs}`, { signal })
        writeCache('incidents.' + qs, res.incidents, res.serverTime)
        return { incidents: res.incidents, fetchedAt: res.serverTime, stale: false }
      } catch (err) {
        const cached = err instanceof ApiError && err.isOffline ? readCache<Incident[]>('incidents.' + qs) : null
        if (cached) return { incidents: cached.data, fetchedAt: cached.at, stale: true }
        throw err
      }
    },
  })
}

export interface IncidentDetail {
  incident: Incident
  history: StatusHistoryEntry[]
  fetchedAt: string
  stale: boolean
}

export function useIncident(id: number) {
  return useQuery<IncidentDetail>({
    queryKey: ['incident', id],
    networkMode: 'always',
    queryFn: async ({ signal }) => {
      try {
        const res = await api<{ incident: Incident; history: StatusHistoryEntry[]; serverTime: string }>(`/incidents/${id}`, { signal })
        writeCache('incident.' + id, res, res.serverTime)
        return { incident: res.incident, history: res.history, fetchedAt: res.serverTime, stale: false }
      } catch (err) {
        const cached = err instanceof ApiError && err.isOffline ? readCache<{ incident: Incident; history: StatusHistoryEntry[] }>('incident.' + id) : null
        if (cached) return { ...cached.data, fetchedAt: cached.at, stale: true }
        throw err
      }
    },
  })
}

export function useCategories() {
  return useQuery<Category[]>({
    queryKey: ['categories'],
    staleTime: 3600_000,
    networkMode: 'always',
    queryFn: async () => {
      try {
        const res = await api<{ categories: Category[] }>('/categories', { auth: false })
        writeCache('categories', res.categories, new Date().toISOString())
        return res.categories
      } catch (err) {
        const cached = readCache<Category[]>('categories')
        if (cached) return cached.data
        throw err
      }
    },
  })
}
