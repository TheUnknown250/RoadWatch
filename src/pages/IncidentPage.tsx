import { ArrowLeft, Clock, MapPin, User } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { CommentsSection } from '@/components/CommentsSection'
import { IncidentMap } from '@/components/IncidentMap'
import { ShareButton } from '@/components/ShareButton'
import { StaleNotice } from '@/components/StaleNotice'
import { StatusBadge } from '@/components/StatusBadge'
import { VotePanel } from '@/components/VotePanel'
import { WithdrawButton } from '@/components/WithdrawButton'
import { useIncident } from '@/hooks/useIncidents'
import { formatDateTime, SEVERITY_COLOR, STATUS_LABEL, timeAgo } from '@/lib/format'
import type { IncidentStatus } from '@/lib/types'

export default function IncidentPage() {
  const id = Number(useParams().id)
  const { me } = useAuth()
  const { data, isPending, isError } = useIncident(Number.isInteger(id) ? id : 0)

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <Link to="/map" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-ink-soft">
          <ArrowLeft size={16} aria-hidden /> Back to map
        </Link>
        {data && !['rejected', 'withdrawn'].includes(data.incident.status) && <ShareButton path={`/incidents/${data.incident.id}`} title={data.incident.title} />}
      </div>

      {isPending && <p className="text-sm text-ink-soft" role="status">Loading incident</p>}
      {isError && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          This incident could not be found, or it is not available offline.
        </p>
      )}

      {data && (
        <>
          {data.stale && <StaleNotice fetchedAt={data.fetchedAt} />}
          <article className="space-y-4 rounded-3xl border border-line bg-white/80 p-5">
            <header className="space-y-2">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink-soft">
                <span className="size-2.5 rounded-full" style={{ background: SEVERITY_COLOR[data.incident.category.severity] }} aria-hidden />
                {data.incident.category.name}
              </p>
              <h1 className="font-display text-2xl font-bold leading-tight tracking-tight">{data.incident.title}</h1>
              <StatusBadge status={data.incident.status} />
            </header>
            <p className="max-w-prose text-pretty text-ink-soft">{data.incident.description}</p>
            <dl className="space-y-1.5 text-sm text-ink-soft">
              <div className="flex gap-2"><dt className="sr-only">Location</dt><MapPin size={16} className="mt-0.5 shrink-0" aria-hidden /><dd>{[data.incident.addressText, data.incident.state].filter(Boolean).join(', ') || 'Pinned on map'} <span className="tabular-nums text-ink-faint">({data.incident.latitude.toFixed(4)}, {data.incident.longitude.toFixed(4)})</span></dd></div>
              <div className="flex gap-2"><dt className="sr-only">When</dt><Clock size={16} className="mt-0.5 shrink-0" aria-hidden /><dd className="tabular-nums">{formatDateTime(data.incident.occurredAt)} ({timeAgo(data.incident.occurredAt)})</dd></div>
              <div className="flex gap-2"><dt className="sr-only">Reported by</dt><User size={16} className="mt-0.5 shrink-0" aria-hidden /><dd>{data.incident.isAnonymous ? (me?.id === data.incident.reporter.id ? `${data.incident.reporter.displayName} (shown to others as Anonymous)` : data.incident.reporter.id === 0 ? 'Anonymous' : `${data.incident.reporter.displayName} (anonymous to the public)`) : data.incident.reporter.displayName}</dd></div>
            </dl>
            <div className="grid grid-cols-2 gap-3 text-center tabular-nums">
              <div className="rounded-2xl bg-emerald-50 p-3"><p className="font-display text-2xl font-bold text-emerald-800">{data.incident.confirmCount}</p><p className="text-xs text-emerald-800">Confirmations</p></div>
              <div className="rounded-2xl bg-orange-50 p-3"><p className="font-display text-2xl font-bold text-orange-800">{data.incident.flagCount}</p><p className="text-xs text-orange-800">Flags</p></div>
            </div>
            {!data.stale && <VotePanel incident={data.incident} />}
            {!data.stale && me?.id === data.incident.reporter.id && data.incident.status === 'pending' && <WithdrawButton incidentId={data.incident.id} />}
          </article>

          <div className="overflow-hidden rounded-2xl border border-line">
            <IncidentMap incidents={[data.incident]} pinned={null} className="h-56 w-full" />
          </div>

          {!data.stale && <CommentsSection incidentId={data.incident.id} closed={['rejected', 'withdrawn'].includes(data.incident.status)} />}

          <section aria-labelledby="history-h" className="rounded-3xl border border-line bg-white/80 p-5">
            <h2 id="history-h" className="font-display text-base font-semibold">Status history</h2>
            <ol className="mt-3 space-y-3 border-l border-line pl-4">
              {data.history.map((h, idx) => (
                <li key={idx} className="text-sm">
                  <p className="font-medium text-ink">{STATUS_LABEL[h.to as IncidentStatus] ?? h.to}</p>
                  <p className="text-xs tabular-nums text-ink-faint">{formatDateTime(h.at)}{h.by ? ` by ${h.by}` : ' (automatic)'}</p>
                  {h.reason && <p className="mt-0.5 text-ink-soft">{h.reason}</p>}
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  )
}
