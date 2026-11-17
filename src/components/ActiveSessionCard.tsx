import { useMutation, useQueryClient } from '@tanstack/react-query'
import { MapPinned, Phone, Radio } from 'lucide-react'
import { useCallback } from 'react'
import { toast } from 'sonner'
import { useBeacon } from '@/hooks/useBeacon'
import { api, errorMessage } from '@/lib/api'
import { formatClock } from '@/lib/format'
import type { SafetySession } from '@/lib/types'

/** The user's own live SOS or monitored trip, with the controls to end it. */
export function ActiveSessionCard({ session }: { session: SafetySession }) {
  const qc = useQueryClient()
  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['safety'] })
  }, [qc])
  const beacon = useBeacon(session.status === 'ended' ? null : session.id, (s) => {
    if (s.status === 'ended') {
      toast.success(s.outcome === 'arrived' ? 'You arrived. Trip sharing has ended.' : 'Session ended')
      refresh()
    }
  })
  const end = useMutation({
    mutationFn: (outcome: 'arrived' | 'safe' | 'cancelled') => api(`/safety/${session.id}/end`, { body: { outcome } }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  })
  const sos = session.kind === 'sos'

  return (
    <section aria-label={sos ? 'Active SOS' : 'Active trip'} className={`space-y-3 rounded-3xl p-5 ${sos ? 'border border-red-200 bg-red-50' : session.status === 'overdue' ? 'border border-amber-300 bg-amber-50' : 'border border-line bg-white/80'}`}>
      <p className="flex items-center gap-2 font-display text-lg font-bold">
        {sos ? <Radio size={18} className="text-red-700" aria-hidden /> : <MapPinned size={18} aria-hidden />}
        {sos ? 'SOS is active' : session.status === 'overdue' ? 'Your trip is overdue' : 'Trip sharing is on'}
      </p>
      {sos ? (
        <p className="text-sm text-ink-soft">{session.communities.length ? `Members of ${session.communities.map((c) => c.name).join(', ')} can see your live location.` : 'You are not in a community, so nobody on RoadWatch can see this alert. Call 112.'}</p>
      ) : (
        <p className="text-sm text-ink-soft tabular-nums">To {session.destination?.label ?? 'your destination'}, due {session.expectedArrival ? formatClock(session.expectedArrival) : 'soon'}. {session.communities.length ? `Shared with ${session.communities.map((c) => c.name).join(', ')}.` : 'Not shared with a community.'} We tell them if you are {session.graceMinutes} minutes late.</p>
      )}
      <p className="text-xs text-ink-soft" role="status">
        {beacon.error ? beacon.error : beacon.lastSent ? `Location sent at ${beacon.lastSent.toLocaleTimeString('en-NG', { hour12: false })}.` : 'Waiting for your location.'} Keep this page open: browsers stop sharing location when the app is in the background.
      </p>
      <div className="flex flex-wrap gap-2">
        {sos ? (
          <button type="button" disabled={end.isPending} onClick={() => end.mutate('safe')} className="min-h-12 rounded-full bg-emerald-700 px-6 font-semibold text-white disabled:opacity-60">I am safe</button>
        ) : (
          <button type="button" disabled={end.isPending} onClick={() => end.mutate('arrived')} className="min-h-12 rounded-full bg-emerald-700 px-6 font-semibold text-white disabled:opacity-60">I have arrived</button>
        )}
        <button type="button" disabled={end.isPending} onClick={() => end.mutate('cancelled')} className="min-h-12 rounded-full bg-white px-6 font-semibold ring-1 ring-inset ring-line disabled:opacity-60">{sos ? 'False alarm' : 'Stop sharing'}</button>
        <a href="tel:112" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-6 font-semibold text-white"><Phone size={16} aria-hidden /> Call 112</a>
      </div>
    </section>
  )
}
