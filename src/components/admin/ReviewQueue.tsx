import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { StatusBadge } from '@/components/StatusBadge'
import { api, errorMessage } from '@/lib/api'
import { STATUS_LABEL, timeAgo } from '@/lib/format'
import type { Incident, IncidentStatus } from '@/lib/types'

const QUEUES: { label: string; statuses: IncidentStatus[] }[] = [
  { label: 'Needs review', statuses: ['pending', 'disputed'] },
  { label: 'Verified', statuses: ['verified'] },
  { label: 'Closed', statuses: ['resolved', 'rejected', 'expired'] },
]

const ACTIONS: IncidentStatus[] = ['verified', 'disputed', 'resolved', 'rejected']

export function ReviewQueue() {
  const qc = useQueryClient()
  const [queue, setQueue] = useState(0)
  const [acting, setActing] = useState<{ id: number; to: IncidentStatus } | null>(null)
  const [reason, setReason] = useState('')

  const statuses = QUEUES[queue].statuses.join(',')
  const { data, isPending } = useQuery({
    queryKey: ['admin-incidents', statuses],
    queryFn: () => api<{ incidents: Incident[] }>(`/admin/incidents?status=${statuses}&limit=100`),
  })

  const moderate = useMutation({
    mutationFn: (v: { id: number; status: IncidentStatus; reason: string }) =>
      api(`/admin/incidents/${v.id}/status`, { method: 'PATCH', body: { status: v.status, reason: v.reason } }),
    onSuccess: () => {
      toast.success('Status updated')
      setActing(null)
      setReason('')
      void qc.invalidateQueries({ queryKey: ['admin-incidents'] })
      void qc.invalidateQueries({ queryKey: ['admin-stats'] })
      void qc.invalidateQueries({ queryKey: ['incidents'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Review queues" className="flex gap-2 overflow-x-auto">
        {QUEUES.map((q, idx) => (
          <button key={q.label} role="tab" type="button" aria-selected={queue === idx} onClick={() => { setQueue(idx); setActing(null) }} className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-medium ring-1 ring-inset ${queue === idx ? 'bg-ink text-white ring-ink' : 'bg-white text-ink-soft ring-line'}`}>
            {q.label}
          </button>
        ))}
      </div>
      {isPending && <p role="status" className="text-sm text-ink-soft">Loading</p>}
      {data?.incidents.length === 0 && <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">Nothing in this queue.</p>}
      <ul className="space-y-3">
        {data?.incidents.map((i) => (
          <li key={i.id} className="space-y-3 rounded-2xl border border-line bg-white/80 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link to={`/incidents/${i.id}`} className="font-semibold text-ink underline-offset-2 hover:underline">{i.title}</Link>
                <p className="text-xs tabular-nums text-ink-faint">{i.category.name} · {timeAgo(i.createdAt)} · by {i.reporter.displayName} · {i.confirmCount} confirmed / {i.flagCount} flagged</p>
              </div>
              <StatusBadge status={i.status} />
            </div>
            <p className="line-clamp-3 text-sm text-ink-soft">{i.description}</p>
            {acting?.id === i.id ? (
              <form
                className="space-y-2"
                onSubmit={(e) => { e.preventDefault(); moderate.mutate({ id: i.id, status: acting.to, reason: reason.trim() }) }}
              >
                <label className="block text-xs font-semibold text-ink-soft">
                  Reason for marking this {STATUS_LABEL[acting.to].toLowerCase()} (kept in the audit trail)
                  <input value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} maxLength={500} autoFocus className="mt-1 h-11 w-full rounded-xl border border-line bg-white px-3 text-sm font-normal" />
                </label>
                <div className="flex gap-2">
                  <button type="submit" disabled={moderate.isPending} className="min-h-11 rounded-full bg-ink px-5 text-sm font-semibold text-white disabled:opacity-60">Confirm</button>
                  <button type="button" onClick={() => setActing(null)} className="min-h-11 px-3 text-sm font-medium text-ink-soft">Cancel</button>
                </div>
              </form>
            ) : (
              <div className="flex flex-wrap gap-2">
                {ACTIONS.filter((a) => a !== i.status).map((a) => (
                  <button key={a} type="button" onClick={() => { setActing({ id: i.id, to: a }); setReason('') }} className="min-h-11 rounded-full bg-white px-4 text-sm font-medium ring-1 ring-inset ring-line">
                    Mark {STATUS_LABEL[a].toLowerCase()}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
