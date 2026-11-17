import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthContext'
import { SavedPlaces } from '@/components/SavedPlaces'
import { Switch } from '@/components/Switch'
import { api, errorMessage } from '@/lib/api'
import type { UserSettings } from '@/lib/types'

export default function SettingsPage() {
  const { me, status } = useAuth()
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['settings'], enabled: Boolean(me), queryFn: () => api<{ settings: UserSettings }>('/me/settings') })
  const update = useMutation({
    mutationFn: (patch: Partial<UserSettings>) => api<{ settings: UserSettings }>('/me/settings', { method: 'PATCH', body: patch }),
    onSuccess: (r) => {
      qc.setQueryData(['settings'], r)
      void qc.invalidateQueries({ queryKey: ['suggestions'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const clear = useMutation({
    mutationFn: () => api('/trips/history', { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Trip history cleared')
      void qc.invalidateQueries({ queryKey: ['suggestions'] })
    },
  })

  if (status === 'loading') return null
  if (!me) {
    return (
      <div className="space-y-3 p-6 text-center">
        <h1 className="font-display text-xl font-bold">Settings</h1>
        <Link to="/signin" state={{ from: '/settings' }} className="inline-flex min-h-12 items-center rounded-full bg-ink px-6 font-semibold text-white">Sign in</Link>
      </div>
    )
  }
  const s = data?.settings
  const set = (patch: Partial<UserSettings>) => update.mutate(patch)

  return (
    <div className="space-y-4 p-4">
      <h1 className="font-display text-2xl font-bold tracking-tight">Settings</h1>

      <section aria-labelledby="ts-h" className="rounded-3xl border border-line bg-white/80 p-5">
        <h2 id="ts-h" className="font-display text-base font-semibold">Trip Suggestions</h2>
        <Switch checked={s?.tripSuggestions ?? true} disabled={!s} onChange={(v) => set({ tripSuggestions: v })} label="Suggest trips" description="On the Home screen, RoadWatch suggests where you may be heading, when to leave, and warns about incidents on the way." />
        <p className="text-xs text-ink-soft">It uses the places and arrival times you save below, and trips you start from the route planner. It does not read your calendar or track you in the background.</p>
        <button type="button" onClick={() => clear.mutate()} disabled={clear.isPending} className="mt-2 min-h-11 text-sm font-semibold text-focus underline">Clear my trip history</button>
      </section>

      <section aria-labelledby="nav-h" className="rounded-3xl border border-line bg-white/80 p-5">
        <h2 id="nav-h" className="font-display text-base font-semibold">Navigation</h2>
        <Switch checked={s?.preferSafest ?? true} disabled={!s} onChange={(v) => set({ preferSafest: v })} label="Prefer the safest route" description="Accept a longer trip to avoid reported danger. When off, speed counts for more." />
        <Switch checked={s?.avoidTolls ?? false} disabled={!s} onChange={(v) => set({ avoidTolls: v })} label="Avoid tolls" />
        <Switch checked={s?.avoidMotorways ?? false} disabled={!s} onChange={(v) => set({ avoidMotorways: v })} label="Avoid motorways" />
        <Switch checked={s?.avoidFerries ?? false} disabled={!s} onChange={(v) => set({ avoidFerries: v })} label="Avoid ferries" />
        <p className="text-xs text-ink-soft">Avoid options only work if the routing service supports them. If it does not, the route planner tells you instead of pretending.</p>
      </section>

      <section aria-labelledby="sos-h" className="rounded-3xl border border-line bg-white/80 p-5">
        <h2 id="sos-h" className="font-display text-base font-semibold">Safety</h2>
        <Switch checked={s?.shareSosWithCommunities ?? true} disabled={!s} onChange={(v) => set({ shareSosWithCommunities: v })} label="Send SOS alerts to my communities" description="When on, an SOS alert notifies the members of every community you belong to." />
      </section>

      <SavedPlaces />
    </div>
  )
}
