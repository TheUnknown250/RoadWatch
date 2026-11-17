import { MapPin, ThumbsDown, ThumbsUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatDistance, SEVERITY_COLOR, timeAgo } from '@/lib/format'
import type { Incident } from '@/lib/types'
import { StatusBadge } from './StatusBadge'

export function IncidentCard({ incident: i }: { incident: Incident }) {
  return (
    <Link
      to={`/incidents/${i.id}`}
      className="block rounded-2xl border border-line bg-white/80 p-4 transition-colors hover:bg-white focus-visible:bg-white"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink-soft">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: SEVERITY_COLOR[i.category.severity] }} aria-hidden />
            {i.category.name}
          </p>
          <h3 className="mt-1 text-base font-semibold leading-snug text-ink">{i.title}</h3>
        </div>
        <StatusBadge status={i.status} />
      </div>
      <p className="mt-2 line-clamp-2 text-pretty text-sm text-ink-soft">{i.description}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums text-ink-faint">
        <span className="inline-flex items-center gap-1">
          <MapPin size={12} aria-hidden />
          {i.addressText || i.state || `${i.latitude.toFixed(3)}, ${i.longitude.toFixed(3)}`}
          {i.distanceM !== undefined && ` (${formatDistance(i.distanceM)} away)`}
        </span>
        <span>{timeAgo(i.occurredAt)}</span>
        <span className="inline-flex items-center gap-1" aria-label={`${i.confirmCount} confirmations, ${i.flagCount} flags`}>
          <ThumbsUp size={12} aria-hidden /> {i.confirmCount}
          <ThumbsDown size={12} className="ml-1" aria-hidden /> {i.flagCount}
        </span>
      </div>
    </Link>
  )
}
