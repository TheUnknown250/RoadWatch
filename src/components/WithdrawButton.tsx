import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Undo2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useOnline } from '@/hooks/useOnline'
import { api, errorMessage } from '@/lib/api'

/** Lets the reporter take back a report that nobody has verified yet. Asks twice to prevent accidents. */
export function WithdrawButton({ incidentId }: { incidentId: number }) {
  const qc = useQueryClient()
  const online = useOnline()
  const [confirming, setConfirming] = useState(false)
  const withdraw = useMutation({
    mutationFn: () => api(`/incidents/${incidentId}/withdraw`, { body: {} }),
    onSuccess: () => {
      toast.success('Your report was withdrawn')
      setConfirming(false)
      void qc.invalidateQueries({ queryKey: ['incident', incidentId] })
      void qc.invalidateQueries({ queryKey: ['incidents'] })
      void qc.invalidateQueries({ queryKey: ['my-incidents'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-ink-soft">
        <Undo2 size={15} aria-hidden /> Withdraw this report
      </button>
    )
  }
  return (
    <div role="alertdialog" aria-label="Confirm withdrawal" className="space-y-2 rounded-2xl bg-canvas p-3">
      <p className="text-sm text-ink-soft">Withdrawn reports are removed from the map and cannot be restored. Continue?</p>
      <div className="flex gap-2">
        <button type="button" disabled={withdraw.isPending || !online} onClick={() => withdraw.mutate()} className="min-h-11 rounded-full bg-ink px-5 text-sm font-semibold text-white disabled:opacity-60">Withdraw</button>
        <button type="button" onClick={() => setConfirming(false)} className="min-h-11 px-3 text-sm font-medium text-ink-soft">Keep it</button>
      </div>
    </div>
  )
}
