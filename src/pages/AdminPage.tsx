import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { AdvisoriesPanel } from '@/components/admin/AdvisoriesPanel'
import { DirectoryPanel } from '@/components/admin/DirectoryPanel'
import { ReviewQueue } from '@/components/admin/ReviewQueue'
import { UsersPanel } from '@/components/admin/UsersPanel'
import { api } from '@/lib/api'

interface Stats {
  byStatus: Record<string, number>
  byCategory: { slug: string; name: string; n: number }[]
  users: number
  incidentsLast24h: number
}

export default function AdminPage() {
  const { me, status } = useAuth()
  const [tab, setTab] = useState<'review' | 'advisories' | 'directory' | 'users'>('review')
  const isStaff = me?.role === 'admin' || me?.role === 'moderator'
  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    enabled: isStaff,
    queryFn: () => api<Stats>('/admin/stats'),
  })

  if (status === 'loading') return null
  if (!isStaff) return <Navigate to="/" replace />

  const tiles = [
    ['Awaiting review', (stats?.byStatus.pending ?? 0) + (stats?.byStatus.disputed ?? 0)],
    ['Verified', stats?.byStatus.verified ?? 0],
    ['New in 24 h', stats?.incidentsLast24h ?? 0],
    ['Users', stats?.users ?? 0],
  ] as const

  return (
    <div className="space-y-4 p-4">
      <h1 className="font-display text-2xl font-bold tracking-tight">Review dashboard</h1>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-line bg-white/80 p-3">
            <dd className="font-display text-2xl font-bold tabular-nums">{v}</dd>
            <dt className="text-xs text-ink-soft">{k}</dt>
          </div>
        ))}
      </dl>
      {me?.role === 'admin' && (
        <div role="tablist" aria-label="Admin sections" className="inline-flex rounded-full bg-white p-1 ring-1 ring-inset ring-line">
          {([['review', 'Reports'], ['advisories', 'Advisories'], ['directory', 'Numbers'], ['users', 'Users']] as const).map(([v, t]) => (
            <button key={v} role="tab" type="button" aria-selected={tab === v} onClick={() => setTab(v)} className={`min-h-10 rounded-full px-5 text-sm font-medium ${tab === v ? 'bg-ink text-white' : 'text-ink-soft'}`}>{t}</button>
          ))}
        </div>
      )}
      {tab === 'review' && <ReviewQueue />}
      {tab === 'advisories' && me?.role === 'admin' && <AdvisoriesPanel />}
      {tab === 'directory' && me?.role === 'admin' && <DirectoryPanel />}
      {tab === 'users' && me?.role === 'admin' && <UsersPanel />}
    </div>
  )
}
