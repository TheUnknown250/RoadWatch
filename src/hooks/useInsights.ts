import { useQuery } from '@tanstack/react-query'
import { api, ApiError } from '@/lib/api'
import type { InsightsSummary } from '@/lib/types'
import { readCache, writeCache } from './useIncidents'

export function useInsights(days: number) {
  return useQuery<InsightsSummary & { stale: boolean }>({
    queryKey: ['insights', days],
    networkMode: 'always',
    queryFn: async ({ signal }) => {
      try {
        const res = await api<InsightsSummary>(`/insights/summary?days=${days}`, { auth: false, signal })
        writeCache(`insights.${days}`, res, res.serverTime)
        return { ...res, stale: false }
      } catch (err) {
        const cached = err instanceof ApiError && err.isOffline ? readCache<InsightsSummary>(`insights.${days}`) : null
        if (cached) return { ...cached.data, serverTime: cached.at, stale: true }
        throw err
      }
    },
  })
}
