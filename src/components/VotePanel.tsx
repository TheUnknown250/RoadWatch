import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ThumbsDown, ThumbsUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthContext'
import { useOnline } from '@/hooks/useOnline'
import { api, errorMessage } from '@/lib/api'
import type { Incident } from '@/lib/types'

const CLOSED = ['resolved', 'rejected', 'expired']

export function VotePanel({ incident }: { incident: Incident }) {
  const { me } = useAuth()
  const online = useOnline()
  const qc = useQueryClient()

  const vote = useMutation({
    mutationFn: (v: 'confirm' | 'flag') => api(`/incidents/${incident.id}/verifications`, { body: { vote: v } }),
    onSuccess: () => {
      toast.success('Thanks, your verification was recorded')
      void qc.invalidateQueries({ queryKey: ['incident', incident.id] })
      void qc.invalidateQueries({ queryKey: ['incidents'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  if (CLOSED.includes(incident.status)) return <p className="text-sm text-ink-soft">Verification is closed for this incident.</p>
  if (!me) {
    return (
      <p className="text-sm text-ink-soft">
        <Link to="/signin" className="font-semibold text-focus underline">Sign in</Link> to confirm or flag this report.
      </p>
    )
  }
  if (me.id === incident.reporter.id) return <p className="text-sm text-ink-soft">You reported this incident. Other road users can verify it.</p>
  if (incident.myVote) {
    return <p className="text-sm font-medium text-ink">You {incident.myVote === 'confirm' ? 'confirmed' : 'flagged'} this report. Votes cannot be changed.</p>
  }

  const disabled = vote.isPending || !online
  return (
    <div>
      <p className="mb-2 text-sm text-ink-soft">Is this report accurate? Only vote if you know the situation first hand or can see it.</p>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" disabled={disabled} onClick={() => vote.mutate('confirm')} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50">
          <ThumbsUp size={16} aria-hidden /> Confirm
        </button>
        <button type="button" disabled={disabled} onClick={() => vote.mutate('flag')} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-ink ring-1 ring-inset ring-line disabled:opacity-50">
          <ThumbsDown size={16} aria-hidden /> Flag as wrong
        </button>
      </div>
      {!online && <p className="mt-2 text-xs text-ink-faint">Voting needs a connection.</p>}
    </div>
  )
}
