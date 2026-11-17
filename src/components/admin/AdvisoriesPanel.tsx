import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { api, errorMessage } from '@/lib/api'
import { field as val } from '@/lib/form'
import { formatDateTime } from '@/lib/format'
import { NIGERIAN_STATES } from '@/lib/nigeria'
import type { Advisory } from '@/lib/types'

const input = 'mt-1 w-full rounded-xl border border-line bg-white px-3 text-sm font-normal'

export function AdvisoriesPanel() {
  const qc = useQueryClient()
  const [notify, setNotify] = useState(false)
  const { data } = useQuery({ queryKey: ['advisories'], queryFn: () => api<{ advisories: Advisory[] }>('/advisories', { auth: false }) })

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => api('/admin/advisories', { body }),
    onSuccess: () => {
      toast.success('Advisory published')
      void qc.invalidateQueries({ queryKey: ['advisories'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const end = useMutation({
    mutationFn: (id: number) => api(`/admin/advisories/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['advisories'] }),
    onError: (e) => toast.error(errorMessage(e)),
  })

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    create.mutate(
      {
        title: val(f, 'title').trim(),
        body: val(f, 'body').trim(),
        severity: val(f, 'severity'),
        state: val(f, 'state').trim() || undefined,
        expiresInHours: Number(val(f, 'hours')),
        notify,
      },
      { onSuccess: () => e.currentTarget.reset() },
    )
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-line bg-white/80 p-4">
        <h2 className="font-display text-base font-semibold">Publish an official advisory</h2>
        <label className="block text-xs font-semibold text-ink-soft">Title<input name="title" required minLength={3} maxLength={120} className={`${input} h-11`} /></label>
        <label className="block text-xs font-semibold text-ink-soft">Message<textarea name="body" required minLength={10} maxLength={1000} rows={3} className={`${input} py-2`} /></label>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs font-semibold text-ink-soft">Level
            <select name="severity" defaultValue="info" className={`${input} h-11`}><option value="info">Info</option><option value="warning">Warning</option><option value="critical">Critical</option></select>
          </label>
          <label className="text-xs font-semibold text-ink-soft">State
            <input name="state" list="adv-states" placeholder="All" className={`${input} h-11`} />
            <datalist id="adv-states">{NIGERIAN_STATES.map((s) => <option key={s} value={s} />)}</datalist>
          </label>
          <label className="text-xs font-semibold text-ink-soft">Lasts (hours)
            <input name="hours" type="number" min={1} max={720} defaultValue={72} className={`${input} h-11`} />
          </label>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="size-5" />
          Also send an alert (and push notification) to every user
        </label>
        <button type="submit" disabled={create.isPending} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-white disabled:opacity-60">
          {create.isPending && <Loader2 size={15} className="animate-spin" aria-hidden />} Publish
        </button>
      </form>

      <section aria-labelledby="active-adv-h" className="space-y-2">
        <h2 id="active-adv-h" className="font-display text-base font-semibold">Active advisories</h2>
        {data?.advisories.length === 0 && <p className="text-sm text-ink-soft">None right now.</p>}
        {data?.advisories.map((a) => (
          <div key={a.id} className="flex items-start justify-between gap-3 rounded-2xl border border-line bg-white/80 p-3">
            <div className="min-w-0 text-sm">
              <p className="font-semibold">{a.title} <span className="text-xs font-medium uppercase text-ink-faint">{a.severity}{a.state ? ` · ${a.state}` : ''}</span></p>
              <p className="text-ink-soft">{a.body}</p>
              <p className="text-xs tabular-nums text-ink-faint">Ends {formatDateTime(a.expiresAt)}</p>
            </div>
            <button type="button" onClick={() => end.mutate(a.id)} className="min-h-11 shrink-0 rounded-full bg-white px-4 text-sm font-medium ring-1 ring-inset ring-line">End now</button>
          </div>
        ))}
      </section>
    </div>
  )
}
