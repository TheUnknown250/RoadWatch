import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import { Phone, Smartphone, TriangleAlert, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthContext'
import { ActiveSessionCard } from '@/components/ActiveSessionCard'
import type { Spot } from '@/components/LocationField'
import { SosButton } from '@/components/SosButton'
import { TripMonitorForm } from '@/components/TripMonitorForm'
import { useGeolocation } from '@/hooks/useGeolocation'
import { requestMotionAccess, useShake } from '@/hooks/useShake'
import { api, errorMessage } from '@/lib/api'
import { timeAgo } from '@/lib/format'
import type { SafetySession } from '@/lib/types'

export default function SafetyPage() {
  const { me, status } = useAuth()
  const qc = useQueryClient()
  const geo = useGeolocation()
  const nav = (useLocation().state ?? null) as { destination?: Spot; etaSeconds?: number } | null
  const [shake, setShake] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)

  const { data: mine } = useQuery({ queryKey: ['safety', 'mine'], enabled: Boolean(me), queryFn: () => api<{ sessions: SafetySession[] }>('/safety/mine') })
  const { data: shared } = useQuery({ queryKey: ['safety', 'shared'], enabled: Boolean(me), refetchInterval: 15_000, queryFn: () => api<{ sessions: SafetySession[] }>('/safety/shared') })

  const sos = useMutation({
    mutationFn: async () => {
      const here = await geo.request()
      if (!here) throw new Error('Your location could not be found, so the alert was not sent. Call 112 now.')
      return api<{ session: SafetySession; notified: number; existing: boolean }>('/safety/sos', { body: { latitude: here.lat, longitude: here.lng } })
    },
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['safety'] })
      if (r.existing) toast.message('Your SOS is already active')
      else if (r.notified > 0) toast.success(`SOS sent to ${r.notified} ${r.notified === 1 ? 'person' : 'people'}`)
      else toast.warning('SOS started, but nobody is in your communities to see it. Call 112.')
    },
    onError: (e) => toast.error(errorMessage(e), { duration: 10_000 }),
  })

  const triggerSos = sos.mutate
  const onShake = useCallback(() => setCountdown((c) => c ?? 5), [])
  useShake(shake, onShake)

  // Shake gives five seconds to cancel before anything is sent.
  useEffect(() => {
    if (countdown === null) return
    const t = window.setTimeout(() => {
      if (countdown <= 1) {
        setCountdown(null)
        triggerSos()
      } else setCountdown(countdown - 1)
    }, 1000)
    return () => window.clearTimeout(t)
  }, [countdown, triggerSos])

  async function toggleShake() {
    if (shake) return setShake(false)
    if (await requestMotionAccess()) {
      setShake(true)
      toast.success('Shake to send SOS is on while this page is open')
    } else toast.error('Motion access was not granted, so shake detection is unavailable on this device.')
  }

  if (status === 'loading') return null
  if (!me) {
    return (
      <div className="space-y-3 p-6 text-center">
        <h1 className="font-display text-xl font-bold">SOS and safety monitor</h1>
        <p className="text-ink-soft">Sign in to send SOS alerts and share your trips with people you trust.</p>
        <Link to="/signin" state={{ from: '/safety' }} className="inline-flex min-h-12 items-center rounded-full bg-ink px-6 font-semibold text-white">Sign in or register</Link>
        <p className="text-sm"><a href="tel:112" className="font-semibold text-focus underline">In an emergency, call 112</a></p>
      </div>
    )
  }

  const active = mine?.sessions ?? []
  const activeSos = active.find((s) => s.kind === 'sos')
  const activeTrip = active.find((s) => s.kind === 'trip')

  return (
    <div className="space-y-5 p-4">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight">SOS and safety monitor</h1>
        <p className="mt-1 text-pretty text-sm text-ink-soft">RoadWatch alerts the members of your communities. It does not contact the police or any emergency service.</p>
      </header>

      <a href="tel:112" className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-ink font-display text-lg font-semibold text-white"><Phone size={20} aria-hidden /> Call 112 (emergency)</a>

      {countdown !== null && (
        <div role="alertdialog" aria-label="SOS countdown" className="space-y-3 rounded-2xl border border-red-300 bg-red-50 p-5 text-center">
          <p className="font-display text-xl font-bold text-red-900">Sending SOS in <span className="tabular-nums">{countdown}</span></p>
          <p className="text-sm text-red-900/80">Shake detected.</p>
          <button type="button" autoFocus onClick={() => setCountdown(null)} className="min-h-12 rounded-full bg-white px-8 font-semibold ring-1 ring-inset ring-line">Cancel</button>
        </div>
      )}

      {activeSos ? (
        <ActiveSessionCard session={activeSos} />
      ) : (
        <section aria-labelledby="sos-h" className="space-y-4 rounded-3xl border border-line bg-white/80 p-5 text-center">
          <h2 id="sos-h" className="sr-only">Send an SOS</h2>
          <SosButton busy={sos.isPending} onTrigger={() => sos.mutate()} />
          <p className="text-pretty text-sm text-ink-soft">Press and hold for 1.5 seconds. Your live location goes to everyone in your communities until you mark yourself safe.</p>
          <button type="button" aria-pressed={shake} onClick={() => void toggleShake()} className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium ring-1 ring-inset ${shake ? 'bg-ink text-white ring-ink' : 'bg-white text-ink-soft ring-line'}`}><Smartphone size={15} aria-hidden /> Shake to send SOS {shake ? 'is on' : 'is off'}</button>
        </section>
      )}

      {activeTrip ? (
        <ActiveSessionCard session={activeTrip} />
      ) : (
        <TripMonitorForm initialDestination={nav?.destination ?? null} initialMinutes={nav?.etaSeconds ? Math.max(15, Math.ceil(nav.etaSeconds / 60 / 5) * 5 + 10) : 30} />
      )}

      <section aria-labelledby="shared-h" className="space-y-3">
        <h2 id="shared-h" className="flex items-center gap-2 font-display text-base font-semibold"><Users size={16} aria-hidden /> Shared with you</h2>
        {shared?.sessions.length ? (
          <ul className="space-y-2">
            {shared.sessions.map((s) => (
              <li key={s.id}>
                <Link to={`/safety/${s.id}`} className={`flex items-center justify-between gap-3 rounded-2xl border p-4 ${s.kind === 'sos' || s.status === 'overdue' ? 'border-red-200 bg-red-50' : 'border-line bg-white/80'}`}>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 font-semibold">{(s.kind === 'sos' || s.status === 'overdue') && <TriangleAlert size={15} className="text-sev-high" aria-hidden />}{s.owner.displayName}</span>
                    <span className="block text-xs text-ink-soft tabular-nums">{s.kind === 'sos' ? 'SOS alert' : s.status === 'overdue' ? 'Overdue' : `Trip to ${s.destination?.label ?? 'a destination'}`} · seen {timeAgo(s.lastSeen)}</span>
                  </span>
                  <span className="text-sm font-semibold text-focus">View</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-ink-soft">Nobody in your communities is sharing a trip or an SOS right now.</p>
        )}
      </section>
    </div>
  )
}
