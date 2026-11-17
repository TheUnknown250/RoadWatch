import { Info, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { LEVEL_STYLE, timeAgo } from '@/lib/format'
import type { SafetyScan } from '@/lib/types'
import { ScoreRing } from './ScoreRing'
import { StatusBadge } from './StatusBadge'

const CONFIDENCE = {
  none: 'No reports in this area, so this score says little.',
  low: 'Based on very few reports.',
  medium: 'Based on a moderate number of reports.',
  high: 'Based on many reports.',
}

export function ScanResult({ scan }: { scan: SafetyScan }) {
  const lvl = LEVEL_STYLE[scan.level]
  const Icon = scan.level === 'safe' ? ShieldCheck : ShieldAlert
  return (
    <div className="space-y-4" aria-live="polite">
      <div className={`flex items-center gap-4 rounded-3xl p-4 ${lvl.panel}`}>
        <ScoreRing score={scan.score} level={scan.level} />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-display text-xl font-bold"><Icon size={20} aria-hidden /> {lvl.label}</p>
          <p className="mt-1 text-sm tabular-nums">{scan.total} report{scan.total === 1 ? '' : 's'} within {scan.radiusKm} km in the last {scan.days} days</p>
          <p className="mt-1 text-xs opacity-80">{CONFIDENCE[scan.confidence]}</p>
        </div>
      </div>

      <section aria-labelledby="advice-h" className="rounded-2xl border border-line bg-white/80 p-4">
        <h3 id="advice-h" className="font-display text-base font-semibold">Before you travel</h3>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink-soft">
          {scan.advice.map((a) => <li key={a} className="text-pretty">{a}</li>)}
          {scan.threats.map((t) => <li key={t.slug} className="text-pretty"><strong className="font-semibold text-ink">{t.name}:</strong> {t.advice}</li>)}
        </ul>
      </section>

      {scan.threats.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Reported threats">
          {scan.threats.map((t) => <li key={t.slug} className="rounded-full bg-white px-3 py-1 text-xs font-medium tabular-nums ring-1 ring-inset ring-line">{t.name}: {t.n}</li>)}
        </ul>
      )}

      {scan.recent.length > 0 && (
        <ul className="space-y-2">
          {scan.recent.map((i) => (
            <li key={i.id}>
              <Link to={`/incidents/${i.id}`} className="flex items-center justify-between gap-2 rounded-xl bg-white/80 px-3 py-2 text-sm ring-1 ring-inset ring-line">
                <span className="min-w-0"><span className="block truncate font-medium">{i.title}</span><span className="text-xs tabular-nums text-ink-faint">{i.category} · {timeAgo(i.occurredAt)}</span></span>
                <StatusBadge status={i.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <details className="rounded-2xl border border-line bg-white/60 p-4 text-sm text-ink-soft">
        <summary className="flex min-h-6 cursor-pointer items-center gap-2 font-medium"><Info size={15} aria-hidden /> How is this calculated?</summary>
        <p className="mt-2 text-pretty">{scan.method}</p>
        <p className="mt-2 text-pretty">It reflects only what RoadWatch users have reported, not official crime statistics. A quiet area is not proof that it is safe.</p>
      </details>
    </div>
  )
}
