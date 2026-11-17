import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, GraduationCap, Home, KeyRound, Plus, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthContext'
import { api, errorMessage } from '@/lib/api'
import { field as val } from '@/lib/form'
import type { Community, CommunityType } from '@/lib/types'

export const TYPE_LABEL: Record<CommunityType, string> = { family: 'Family', neighborhood: 'Neighbourhood or estate', workplace: 'Workplace', school: 'School or students', other: 'Other group' }
const TYPE_ICON = { family: Home, neighborhood: Users, workplace: Building2, school: GraduationCap, other: Users }

const input = 'mt-1 h-12 w-full rounded-xl border border-line bg-white px-3.5 text-base font-normal'

export default function CommunitiesPage() {
  const { me, status } = useAuth()
  const qc = useQueryClient()
  const nav = useNavigate()
  const [creating, setCreating] = useState(false)

  const { data } = useQuery({ queryKey: ['communities'], enabled: Boolean(me), queryFn: () => api<{ communities: Community[] }>('/communities') })
  const refresh = () => void qc.invalidateQueries({ queryKey: ['communities'] })

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<{ community: Community }>('/communities', { body }),
    onSuccess: (r) => { toast.success('Community created'); refresh(); nav(`/communities/${r.community.id}`) },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const join = useMutation({
    mutationFn: (code: string) => api<{ community: Community }>('/communities/join', { body: { code } }),
    onSuccess: (r) => { toast.success(`You joined ${r.community.name}`); refresh(); nav(`/communities/${r.community.id}`) },
    onError: (e) => toast.error(errorMessage(e)),
  })

  if (status === 'loading') return null
  if (!me) {
    return (
      <div className="space-y-3 p-6 text-center">
        <h1 className="font-display text-xl font-bold">Communities</h1>
        <p className="text-ink-soft">Private safety circles for your family, estate, workplace or school.</p>
        <Link to="/signin" state={{ from: '/communities' }} className="inline-flex min-h-12 items-center rounded-full bg-ink px-6 font-semibold text-white">Sign in or register</Link>
      </div>
    )
  }

  function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    create.mutate({ name: val(f, 'name').trim(), type: val(f, 'type'), description: val(f, 'description').trim() || undefined })
  }
  function onJoin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    join.mutate(val(new FormData(e.currentTarget), 'code').trim())
  }

  return (
    <div className="space-y-4 p-4">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight">Communities</h1>
        <p className="mt-1 text-pretty text-sm text-ink-soft">Private groups for the people you trust. Members share alerts, and see each other's SOS and trips only when you choose.</p>
      </header>

      <ul className="space-y-3">
        {data?.communities.map((c) => {
          const Icon = TYPE_ICON[c.type]
          return (
            <li key={c.id}>
              <Link to={`/communities/${c.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-white/80 p-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-canvas"><Icon size={20} aria-hidden /></span>
                <span className="min-w-0 flex-1"><span className="block truncate font-display text-base font-semibold">{c.name}</span><span className="block text-xs text-ink-soft tabular-nums">{TYPE_LABEL[c.type]} · {c.memberCount} member{c.memberCount === 1 ? '' : 's'} · {c.myRole}</span></span>
              </Link>
            </li>
          )
        })}
        {data?.communities.length === 0 && <li className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-ink-soft">You are not in any community yet. Create one or join with an invite code.</li>}
      </ul>

      <form onSubmit={onJoin} className="space-y-3 rounded-3xl border border-line bg-white/80 p-5">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold"><KeyRound size={16} aria-hidden /> Join with an invite code</h2>
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="code">Invite code</label>
          <input id="code" name="code" required minLength={6} maxLength={12} autoCapitalize="characters" autoComplete="off" placeholder="e.g. K7M2QX9R" className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-white px-3.5 text-base uppercase tracking-widest" />
          <button type="submit" disabled={join.isPending} className="min-h-12 rounded-full bg-ink px-6 font-semibold text-white disabled:opacity-60">Join</button>
        </div>
      </form>

      {creating ? (
        <form onSubmit={onCreate} className="space-y-3 rounded-3xl border border-line bg-white/80 p-5">
          <h2 className="font-display text-base font-semibold">Create a community</h2>
          <label className="block text-sm font-semibold">Name<input name="name" required minLength={3} maxLength={60} placeholder="Okafor family" className={input} /></label>
          <label className="block text-sm font-semibold">Type
            <select name="type" defaultValue="family" className={input}>{(Object.keys(TYPE_LABEL) as CommunityType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select>
          </label>
          <label className="block text-sm font-semibold">Description (optional)<textarea name="description" maxLength={300} rows={2} className="mt-1 w-full rounded-xl border border-line bg-white px-3.5 py-2 text-base font-normal" /></label>
          <div className="flex gap-2">
            <button type="submit" disabled={create.isPending} className="min-h-12 rounded-full bg-ink px-6 font-semibold text-white disabled:opacity-60">Create</button>
            <button type="button" onClick={() => setCreating(false)} className="min-h-12 px-4 font-medium text-ink-soft">Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setCreating(true)} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-white font-semibold ring-1 ring-inset ring-line"><Plus size={16} aria-hidden /> Create a community</button>
      )}
    </div>
  )
}
