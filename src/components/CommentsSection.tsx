import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Send, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthContext'
import { useOnline } from '@/hooks/useOnline'
import { api, errorMessage } from '@/lib/api'
import { timeAgo } from '@/lib/format'
import type { Comment } from '@/lib/types'

export function CommentsSection({ incidentId, closed }: { incidentId: number; closed: boolean }) {
  const { me } = useAuth()
  const online = useOnline()
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const key = ['comments', incidentId]
  const isStaff = me?.role === 'admin' || me?.role === 'moderator'

  const { data } = useQuery({ queryKey: key, queryFn: () => api<{ comments: Comment[] }>(`/incidents/${incidentId}/comments`) })
  const refresh = () => void qc.invalidateQueries({ queryKey: key })

  const post = useMutation({
    mutationFn: (body: string) => api(`/incidents/${incidentId}/comments`, { body: { body } }),
    onSuccess: () => {
      setText('')
      refresh()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const remove = useMutation({
    mutationFn: (id: number) => api(`/incidents/${incidentId}/comments/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (text.trim().length >= 2) post.mutate(text.trim())
  }

  return (
    <section aria-labelledby="comments-h" className="rounded-3xl border border-line bg-white/80 p-5">
      <h2 id="comments-h" className="font-display text-base font-semibold">Updates from the community <span className="tabular-nums text-ink-faint">({data?.comments.filter((c) => !c.hidden).length ?? 0})</span></h2>
      <p className="mt-1 text-xs text-ink-faint">Share what you see now: is the road clear, are officers present? Do not post personal details.</p>

      <ul className="mt-3 space-y-3">
        {data?.comments.map((c) => (
          <li key={c.id} className={`rounded-2xl bg-canvas p-3 ${c.hidden ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold">
                {c.author.displayName}
                {c.author.role !== 'user' && <span className="ml-2 rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">{c.author.role}</span>}
                {c.hidden && <span className="ml-2 text-xs font-normal text-ink-faint">(removed)</span>}
              </p>
              {(c.mine || isStaff) && !c.hidden && (
                <button type="button" onClick={() => remove.mutate(c.id)} aria-label="Remove comment" className="grid size-9 shrink-0 place-items-center text-ink-faint"><Trash2 size={15} aria-hidden /></button>
              )}
            </div>
            <p className="mt-0.5 text-pretty text-sm text-ink-soft">{c.body}</p>
            <p className="mt-1 text-xs tabular-nums text-ink-faint">{timeAgo(c.createdAt)}</p>
          </li>
        ))}
        {data?.comments.length === 0 && <li className="text-sm text-ink-soft">No updates yet.</li>}
      </ul>

      {closed ? null : me ? (
        <form onSubmit={submit} className="mt-4 flex gap-2">
          <label className="sr-only" htmlFor="new-comment">Add an update</label>
          <input id="new-comment" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} minLength={2} required placeholder="Add an update" className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-white px-3 text-sm" />
          <button type="submit" disabled={post.isPending || !online} aria-label="Post update" className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-white disabled:opacity-50"><Send size={16} aria-hidden /></button>
        </form>
      ) : (
        <p className="mt-4 text-sm text-ink-soft"><Link to="/signin" state={{ from: `/incidents/${incidentId}` }} className="font-semibold text-focus underline">Sign in</Link> to add an update.</p>
      )}
    </section>
  )
}
