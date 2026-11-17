import { useState } from 'react'
import { Link } from 'react-router-dom'
import { StaleNotice } from '@/components/StaleNotice'
import { useInsights } from '@/hooks/useInsights'
import { SEVERITY_COLOR } from '@/lib/format'
import type { InsightsSummary } from '@/lib/types'

const PERIODS = [7, 30, 90] as const

function Trend({ data }: { data: InsightsSummary['trend'] }) {
  const max = Math.max(1, ...data.map((d) => d.n))
  const w = 100 / data.length
  return (
    <figure>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-28 w-full" role="img" aria-label={`Reports per day, highest day ${max}`}>
        {data.map((d, i) => {
          const h = (d.n / max) * 36
          return <rect key={d.day} x={i * w + w * 0.15} y={38 - h} width={w * 0.7} height={Math.max(h, d.n ? 0.8 : 0.3)} rx="0.4" fill="#0F1B33" opacity={d.n ? 1 : 0.2} />
        })}
      </svg>
      <figcaption className="mt-1 flex justify-between text-xs tabular-nums text-ink-faint">
        <span>{data[0]?.day}</span>
        <span>{data.at(-1)?.day}</span>
      </figcaption>
    </figure>
  )
}

export default function InsightsPage() {
  const [days, setDays] = useState<number>(30)
  const { data, isPending, isError } = useInsights(days)
  const maxCat = Math.max(1, ...(data?.byCategory.map((c) => c.n) ?? [1]))

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-end justify-between gap-3">
        <h1 className="font-display text-2xl font-bold tracking-tight">Road safety insights</h1>
        <div role="group" aria-label="Time period" className="inline-flex rounded-full bg-white p-1 ring-1 ring-inset ring-line">
          {PERIODS.map((p) => (
            <button key={p} type="button" aria-pressed={days === p} onClick={() => setDays(p)} className={`min-h-10 rounded-full px-3.5 text-sm font-medium tabular-nums ${days === p ? 'bg-ink text-white' : 'text-ink-soft'}`}>{p} d</button>
          ))}
        </div>
      </div>

      {data?.stale && <StaleNotice fetchedAt={data.serverTime} />}
      {isPending && <p role="status" className="text-sm text-ink-soft">Loading</p>}
      {isError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">Insights could not be loaded. Check your connection.</p>}

      {data && (
        <>
          <dl className="grid grid-cols-3 gap-3">
            {([['Reports', data.total], ['Verified', data.verified], ['Open now', data.open]] as const).map(([k, v]) => (
              <div key={k} className="rounded-2xl border border-line bg-white/80 p-3">
                <dd className="font-display text-2xl font-bold tabular-nums">{v}</dd>
                <dt className="text-xs text-ink-soft">{k}</dt>
              </div>
            ))}
          </dl>

          <section aria-labelledby="trend-h" className="rounded-3xl border border-line bg-white/80 p-5">
            <h2 id="trend-h" className="mb-3 font-display text-base font-semibold">Reports per day</h2>
            <Trend data={data.trend} />
          </section>

          <section aria-labelledby="cat-h" className="rounded-3xl border border-line bg-white/80 p-5">
            <h2 id="cat-h" className="mb-3 font-display text-base font-semibold">By category</h2>
            <ul className="space-y-3">
              {data.byCategory.map((c) => (
                <li key={c.slug}>
                  <div className="flex justify-between text-sm"><span>{c.name}</span><span className="tabular-nums font-semibold">{c.n}</span></div>
                  <div className="mt-1 h-2 rounded-full bg-canvas"><div className="h-2 rounded-full" style={{ width: `${(c.n / maxCat) * 100}%`, background: SEVERITY_COLOR[c.severity] }} /></div>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="state-h" className="rounded-3xl border border-line bg-white/80 p-5">
            <h2 id="state-h" className="mb-3 font-display text-base font-semibold">Most reports by state</h2>
            {data.byState.length === 0 ? (
              <p className="text-sm text-ink-soft">No state information in this period.</p>
            ) : (
              <ol className="space-y-2">
                {data.byState.map((s, i) => (
                  <li key={s.state} className="flex justify-between rounded-xl bg-canvas px-3 py-2 text-sm"><span><span className="tabular-nums text-ink-faint">{i + 1}.</span> {s.state}</span><span className="font-semibold tabular-nums">{s.n}</span></li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}

      <Link to="/scan" className="block rounded-3xl border border-line bg-white/80 p-5">
        <h2 className="font-display text-base font-semibold">Planning a trip to an unfamiliar area?</h2>
        <p className="mt-1 text-sm text-ink-soft">Run a Safety Scan for any place in Nigeria to get a colour-coded score and specific advice.</p>
        <span className="mt-3 inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-sm font-semibold text-white">Open Safety Scan</span>
      </Link>
      <p className="text-xs text-ink-faint">Figures come only from reports submitted to RoadWatch, so they show where people report, not official crime statistics. Withdrawn and rejected reports are not counted.</p>
    </div>
  )
}
