import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { api } from '@/lib/api'
import { timeAgo } from '@/lib/format'
import type { AppNotification } from '@/lib/types'

const TYPE_LINK: Record<string, string> = {
  sos: '/safety',
  trip_started: '/safety',
  trip_overdue: '/safety',
  trip_arrived: '/safety',
  community_post: '/communities',
  community_joined: '/communities',
}

export default function NotificationsPage() {
  const { me, status } = useAuth()
  const qc = useQueryClient()
  const { data, isPending } = useQuery({
    queryKey: ['notifications'],
    enabled: Boolean(me),
    queryFn: () => api<{ notifications: AppNotification[]; unread: number }>('/notifications'),
  })
  const refresh = () => void qc.invalidateQueries({ queryKey: ['notifications'] })
  const readAll = useMutation({ mutationFn: () => api('/notifications/read-all', { method: 'POST', body: {} }), onSuccess: refresh })
  const readOne = useMutation({ mutationFn: (id: number) => api(`/notifications/${id}/read`, { method: 'POST', body: {} }), onSuccess: refresh })

  if (status === 'loading') return null
  if (!me) {
    return (
      <div className="space-y-3 p-6 text-center">
        <h1 className="font-display text-xl font-bold">Alerts</h1>
        <p className="text-ink-soft">Sign in to get alerts about incidents in the areas you follow and updates on your reports.</p>
        <Link to="/signin" state={{ from: '/notifications' }} className="inline-flex min-h-12 items-center rounded-full bg-ink px-6 font-semibold text-white">Sign in</Link>
      </div>
    )
  }

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold tracking-tight">Alerts</h1>
        {!!data?.unread && <button type="button" onClick={() => readAll.mutate()} className="min-h-11 text-sm font-medium text-focus">Mark all read</button>}
      </div>
      {isPending && <p role="status" className="text-sm text-ink-soft">Loading</p>}
      {data?.notifications.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">No alerts yet. Follow an area in Account to be told about new incidents nearby.</p>
      )}
      <ul className="space-y-2">
        {data?.notifications.map((n) => (
          <li key={n.id}>
            <Link
              to={n.incidentId ? `/incidents/${n.incidentId}` : (TYPE_LINK[n.type] ?? '/')}
              onClick={() => !n.readAt && readOne.mutate(n.id)}
              className={`block rounded-2xl border p-4 ${n.readAt ? 'border-line bg-white/50' : 'border-ink/20 bg-white'}`}
            >
              <p className="flex items-center justify-between gap-2 text-sm font-semibold">
                {n.title}
                {!n.readAt && <span className="size-2 rounded-full bg-sev-high" aria-label="Unread" />}
              </p>
              <p className="mt-0.5 text-sm text-ink-soft">{n.body}</p>
              <p className="mt-1 text-xs tabular-nums text-ink-faint">{timeAgo(n.createdAt)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
