import { useQuery } from '@tanstack/react-query'
import { Megaphone, X } from 'lucide-react'
import { useState } from 'react'
import { api } from '@/lib/api'
import { timeAgo } from '@/lib/format'
import type { Advisory } from '@/lib/types'

const KEY = 'roadwatch.dismissedAdvisories'
const STYLE = {
  info: 'border-sky-200 bg-sky-50 text-sky-900',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
  critical: 'border-red-300 bg-red-50 text-red-900',
}

function readDismissed(): number[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as number[]
  } catch {
    return []
  }
}

/** Official notices from administrators. Dismissing one hides it on this device only. */
export function AdvisoryBanner() {
  const [dismissed, setDismissed] = useState<number[]>(readDismissed)
  const { data } = useQuery({
    queryKey: ['advisories'],
    refetchInterval: 5 * 60_000,
    queryFn: () => api<{ advisories: Advisory[] }>('/advisories', { auth: false }),
  })
  const shown = (data?.advisories ?? []).filter((a) => !dismissed.includes(a.id))
  if (!shown.length) return null

  function dismiss(id: number) {
    const next = [...dismissed, id].slice(-50)
    setDismissed(next)
    localStorage.setItem(KEY, JSON.stringify(next))
  }

  return (
    <div className="space-y-2" role="region" aria-label="Official advisories">
      {shown.map((a) => (
        <div key={a.id} className={`flex items-start gap-3 rounded-2xl border p-3 ${STYLE[a.severity]}`} role={a.severity === 'critical' ? 'alert' : 'status'}>
          <Megaphone size={18} className="mt-0.5 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">{a.title}{a.state && <span className="ml-2 text-xs font-medium opacity-80">{a.state}</span>}</p>
            <p className="text-pretty">{a.body}</p>
            <p className="mt-1 text-xs tabular-nums opacity-70">Official advisory, {timeAgo(a.createdAt)}</p>
          </div>
          <button type="button" onClick={() => dismiss(a.id)} aria-label={`Dismiss ${a.title}`} className="grid size-9 shrink-0 place-items-center"><X size={16} aria-hidden /></button>
        </div>
      ))}
    </div>
  )
}
