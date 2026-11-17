import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import type { FormEvent } from 'react'
import { toast } from 'sonner'
import { api, errorMessage } from '@/lib/api'
import { field as val } from '@/lib/form'
import { NIGERIAN_STATES } from '@/lib/nigeria'
import type { DirectoryContact } from '@/lib/types'

const KINDS = ['general', 'police', 'fire', 'ambulance', 'road', 'disaster', 'hospital']

export function DirectoryPanel() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['admin', 'directory'], queryFn: () => api<{ contacts: DirectoryContact[] }>('/admin/directory') })
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'directory'] })
    void qc.invalidateQueries({ queryKey: ['directory'] })
  }
  const add = useMutation({
    mutationFn: (body: Record<string, unknown>) => api('/admin/directory', { body }),
    onSuccess: () => { toast.success('Contact added'); refresh() },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const remove = useMutation({ mutationFn: (id: number) => api(`/admin/directory/${id}`, { method: 'DELETE' }), onSuccess: refresh, onError: (e) => toast.error(errorMessage(e)) })

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    add.mutate(
      { name: val(f, 'name').trim(), kind: val(f, 'kind'), phone: val(f, 'phone').trim(), state: val(f, 'state') || undefined, description: val(f, 'description').trim() || undefined, sourceUrl: val(f, 'sourceUrl').trim() || undefined, verified: f.get('verified') === 'on' },
      { onSuccess: () => form.reset() },
    )
  }

  const input = 'mt-1 h-11 w-full rounded-xl border border-line bg-white px-3 text-sm font-normal'
  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-3 rounded-2xl border border-line bg-white/80 p-4">
        <h2 className="font-display text-base font-semibold">Add an emergency contact</h2>
        <p className="text-xs text-ink-soft">Only add numbers you can source. Tick "Confirmed" only if the source is the agency itself or a government site.</p>
        <label className="block text-xs font-semibold text-ink-soft">Name<input name="name" required minLength={2} maxLength={100} className={input} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-ink-soft">Phone<input name="phone" required inputMode="tel" className={input} /></label>
          <label className="text-xs font-semibold text-ink-soft">Type<select name="kind" className={input}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select></label>
        </div>
        <label className="block text-xs font-semibold text-ink-soft">State (blank = nationwide)<select name="state" defaultValue="" className={input}><option value="">Nationwide</option>{NIGERIAN_STATES.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className="block text-xs font-semibold text-ink-soft">Description<input name="description" maxLength={300} className={input} /></label>
        <label className="block text-xs font-semibold text-ink-soft">Source link<input name="sourceUrl" type="url" placeholder="https://" className={input} /></label>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input name="verified" type="checkbox" className="size-5 accent-[#0F1B33]" /> Confirmed from an official source</label>
        <button type="submit" disabled={add.isPending} className="min-h-11 rounded-full bg-ink px-6 text-sm font-semibold text-white disabled:opacity-60">Add contact</button>
      </form>
      <ul className="space-y-2">
        {data?.contacts.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/80 px-3 py-2 text-sm ring-1 ring-inset ring-line">
            <span className="min-w-0"><span className="block truncate font-medium">{c.name}</span><span className="block text-xs tabular-nums text-ink-soft">{c.phone} · {c.kind} · {c.state ?? 'Nationwide'} · {c.verified ? 'confirmed' : 'unconfirmed'}</span></span>
            <button type="button" onClick={() => { if (window.confirm(`Delete ${c.name}?`)) remove.mutate(c.id) }} aria-label={`Delete ${c.name}`} className="grid size-11 shrink-0 place-items-center text-ink-faint"><Trash2 size={16} aria-hidden /></button>
          </li>
        ))}
      </ul>
    </div>
  )
}
