import { CloudOff } from 'lucide-react'
import { formatDateTime, timeAgo } from '@/lib/format'

/** Shown whenever on-screen data came from the device cache instead of the server. */
export function StaleNotice({ fetchedAt }: { fetchedAt: string }) {
  return (
    <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <CloudOff size={16} className="mt-0.5 shrink-0" aria-hidden />
      <p>
        <strong className="font-semibold">Saved data, may be out of date.</strong> Last updated {timeAgo(fetchedAt)} ({formatDateTime(fetchedAt)}). It will refresh when you are back online.
      </p>
    </div>
  )
}
