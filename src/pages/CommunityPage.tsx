import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Copy, MapPin, RefreshCw, TriangleAlert } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthContext'
import { TYPE_LABEL } from '@/pages/CommunitiesPage'
import { useGeolocation } from '@/hooks/useGeolocation'
import { api, errorMessage } from '@/lib/api'
import { timeAgo } from '@/lib/format'
import type { Community, CommunityMember, CommunityPost } from '@/lib/types'

export default function CommunityPage() {
  const id = Number(useParams().id)
  const { me } = useAuth()
  const qc = useQueryClient()
  const nav = useNavigate()
  const geo = useGeolocation()
  const [text, setText] = useState('')
  const [alertKind, setAlertKind] = useState(false)
  const [attach, setAttach] = useState(false)

  const base = `/communities/${id}`
  const { data: c, isError } = useQuery({ queryKey: ['community', id], queryFn: () => api<{ community: Community }>(base) })
  const { data: members } = useQuery({ queryKey: ['community', id, 'members'], enabled: Boolean(c), queryFn: () => api<{ members: CommunityMember[] }>(`${base}/members`) })
  const { data: posts } = useQuery({ queryKey: ['community', id, 'posts'], enabled: Boolean(c), refetchInterval: 30_000, queryFn: () => api<{ posts: CommunityPost[] }>(`${base}/posts`) })
  const community = c?.community
  const admin = community?.myRole === 'owner' || community?.myRole === 'admin'

  const refresh = () => void qc.invalidateQueries({ queryKey: ['community', id] })
  const fail = (e: unknown) => toast.error(errorMessage(e))

  const post = useMutation({
    mutationFn: async () => {
      const where = attach ? await geo.request() : null
      return api(`${base}/posts`, { body: { kind: alertKind ? 'alert' : 'message', body: text.trim(), ...(where ? { latitude: where.lat, longitude: where.lng } : {}) } })
    },
    onSuccess: () => { setText(''); setAttach(false); refresh() },
    onError: fail,
  })
  const leave = useMutation({ mutationFn: () => api(`${base}/members/${me!.id}`, { method: 'DELETE' }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['communities'] }); nav('/communities') }, onError: fail })
  const del = useMutation({ mutationFn: () => api(base, { method: 'DELETE' }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['communities'] }); nav('/communities') }, onError: fail })
  const regen = useMutation({ mutationFn: () => api<{ inviteCode: string }>(`${base}/invite-code`, { body: {} }), onSuccess: () => { toast.success('New invite code created. The old one no longer works.'); refresh() }, onError: fail })
  const kick = useMutation({ mutationFn: (uid: number) => api(`${base}/members/${uid}`, { method: 'DELETE' }), onSuccess: refresh, onError: fail })
  const role = useMutation({ mutationFn: (v: { uid: number; role: 'admin' | 'member' }) => api(`${base}/members/${v.uid}`, { method: 'PATCH', body: { role: v.role } }), onSuccess: refresh, onError: fail })

  if (isError) return <div className="space-y-3 p-6 text-center"><p className="text-ink-soft">This community does not exist, or you are not a member.</p><Link to="/communities" className="font-semibold text-focus underline">Back to communities</Link></div>
  if (!community) return <p role="status" className="p-6 text-sm text-ink-soft">Loading</p>

  function submit(e: FormEvent) {
    e.preventDefault()
    if (text.trim().length >= 2) post.mutate()
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      toast.success('Invite code copied')
    } catch {
      toast.error('Could not copy. Select the code and copy it manually.')
    }
  }

  return (
    <div className="space-y-4 p-4">
      <Link to="/communities" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-ink-soft"><ArrowLeft size={16} aria-hidden /> Communities</Link>

      <header className="rounded-3xl border border-line bg-white/80 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-soft">{TYPE_LABEL[community.type]}</p>
        <h1 className="font-display text-2xl font-bold tracking-tight">{community.name}</h1>
        {community.description && <p className="mt-1 text-pretty text-sm text-ink-soft">{community.description}</p>}
        {community.inviteCode && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-canvas p-3">
            <div className="mr-auto"><p className="text-xs text-ink-soft">Invite code (share only with people you trust)</p><p className="font-mono text-xl font-bold tracking-[0.2em]">{community.inviteCode}</p></div>
            <button type="button" onClick={() => void copy(community.inviteCode!)} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-medium ring-1 ring-inset ring-line"><Copy size={14} aria-hidden /> Copy</button>
            <button type="button" onClick={() => regen.mutate()} disabled={regen.isPending} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-medium ring-1 ring-inset ring-line disabled:opacity-60"><RefreshCw size={14} aria-hidden /> New code</button>
          </div>
        )}
      </header>

      <section aria-labelledby="feed-h" className="space-y-3">
        <h2 id="feed-h" className="font-display text-base font-semibold">Community feed</h2>
        <form onSubmit={submit} className="space-y-3 rounded-2xl border border-line bg-white/80 p-4">
          <label className="sr-only" htmlFor="post">Message</label>
          <textarea id="post" value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={500} required minLength={2} placeholder={alertKind ? 'Describe the alert for everyone in this community' : 'Write a message'} className="w-full rounded-xl border border-line bg-white px-3 py-2 text-base" />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" aria-pressed={alertKind} onClick={() => setAlertKind((v) => !v)} className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium ring-1 ring-inset ${alertKind ? 'bg-sev-high text-white ring-sev-high' : 'bg-white text-ink-soft ring-line'}`}><TriangleAlert size={14} aria-hidden /> Send as alert</button>
            <button type="button" aria-pressed={attach} onClick={() => setAttach((v) => !v)} className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium ring-1 ring-inset ${attach ? 'bg-ink text-white ring-ink' : 'bg-white text-ink-soft ring-line'}`}><MapPin size={14} aria-hidden /> Add my location</button>
            <button type="submit" disabled={post.isPending} className="ml-auto min-h-11 rounded-full bg-ink px-6 text-sm font-semibold text-white disabled:opacity-60">Post</button>
          </div>
          {alertKind && <p className="text-xs text-ink-soft">Alerts notify every other member right away.</p>}
        </form>
        <ul className="space-y-2">
          {posts?.posts.map((p) => (
            <li key={p.id} className={`rounded-2xl border p-3 ${p.kind === 'alert' ? 'border-red-200 bg-red-50/60' : 'border-line bg-white/70'}`}>
              <p className="flex items-center justify-between gap-2 text-sm font-semibold">{p.author.displayName}{p.kind === 'alert' && <span className="inline-flex items-center gap-1 text-xs font-semibold text-sev-high"><TriangleAlert size={12} aria-hidden /> Alert</span>}</p>
              <p className="mt-0.5 text-pretty text-sm text-ink-soft">{p.body}</p>
              <p className="mt-1 text-xs tabular-nums text-ink-faint">{timeAgo(p.createdAt)}{p.latitude !== null && p.longitude !== null && <> · <a className="font-semibold text-focus underline" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps?q=${p.latitude},${p.longitude}`}>View location</a></>}</p>
            </li>
          ))}
          {posts?.posts.length === 0 && <li className="text-sm text-ink-soft">Nothing posted yet.</li>}
        </ul>
      </section>

      <section aria-labelledby="members-h" className="rounded-3xl border border-line bg-white/80 p-5">
        <h2 id="members-h" className="font-display text-base font-semibold">Members <span className="tabular-nums text-ink-faint">({community.memberCount})</span></h2>
        <ul className="mt-3 space-y-2">
          {members?.members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-canvas px-3 py-2 text-sm">
              <span><span className="font-medium">{m.displayName}</span> <span className="text-xs capitalize text-ink-faint">{m.role}</span></span>
              {m.id !== me?.id && m.role !== 'owner' && (
                <span className="flex gap-2">
                  {community.myRole === 'owner' && <button type="button" onClick={() => role.mutate({ uid: m.id, role: m.role === 'admin' ? 'member' : 'admin' })} className="min-h-11 text-xs font-semibold text-focus">{m.role === 'admin' ? 'Make member' : 'Make admin'}</button>}
                  {admin && (m.role === 'member' || community.myRole === 'owner') && <button type="button" onClick={() => { if (window.confirm(`Remove ${m.displayName} from this community?`)) kick.mutate(m.id) }} className="min-h-11 text-xs font-semibold text-red-700">Remove</button>}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap gap-3">
        {community.myRole !== 'owner' ? (
          <button type="button" onClick={() => { if (window.confirm('Leave this community? You will stop seeing its alerts.')) leave.mutate() }} className="min-h-12 rounded-full bg-white px-6 font-semibold ring-1 ring-inset ring-line">Leave community</button>
        ) : (
          <button type="button" onClick={() => { if (window.confirm('Delete this community for everyone? This cannot be undone.')) del.mutate() }} className="min-h-12 rounded-full bg-red-700 px-6 font-semibold text-white">Delete community</button>
        )}
      </div>
    </div>
  )
}
