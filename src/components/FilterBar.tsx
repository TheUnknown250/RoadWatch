import { Crosshair, Search, SlidersHorizontal, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useCategories } from '@/hooks/useIncidents'
import { STATUS_LABEL } from '@/lib/format'
import { EMPTY_FILTERS, type IncidentFilters, type IncidentStatus } from '@/lib/types'

const FILTERABLE: IncidentStatus[] = ['pending', 'verified', 'disputed', 'resolved', 'expired']

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

const chip = (on: boolean) =>
  `min-h-11 rounded-full px-3.5 text-sm font-medium ring-1 ring-inset transition-colors ${
    on ? 'bg-ink text-white ring-ink' : 'bg-white text-ink-soft ring-line hover:bg-stone-50'
  }`

export function FilterBar({ value, onChange }: { value: IncidentFilters; onChange: (f: IncidentFilters) => void }) {
  const { data: categories = [] } = useCategories()
  const [open, setOpen] = useState(false)
  const active = value.categories.length + value.statuses.length + (value.from ? 1 : 0) + (value.to ? 1 : 0) + (value.near ? 1 : 0)

  function nearMe() {
    if (value.near) return onChange({ ...value, near: undefined })
    if (!navigator.geolocation) return void toast.error('Location is not available on this device')
    navigator.geolocation.getCurrentPosition(
      (p) => onChange({ ...value, near: { lat: p.coords.latitude, lng: p.coords.longitude, radiusKm: 25 } }),
      () => toast.error('Could not get your location. Check browser permissions.'),
      { enableHighAccuracy: false, timeout: 10_000 },
    )
  }

  return (
    <section aria-label="Search and filters" className="space-y-3">
      <div className="flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Search by place, road or keyword</span>
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
          <input
            type="search"
            value={value.q}
            onChange={(e) => onChange({ ...value, q: e.target.value })}
            placeholder="Search place, road or keyword"
            className="h-11 w-full rounded-full border border-line bg-white pl-10 pr-4 text-sm placeholder:text-ink-faint"
          />
        </label>
        <button
          type="button"
          onClick={nearMe}
          aria-pressed={Boolean(value.near)}
          aria-label="Show incidents near me"
          className={`grid size-11 shrink-0 place-items-center rounded-full ring-1 ring-inset ${value.near ? 'bg-ink text-white ring-ink' : 'bg-white text-ink-soft ring-line'}`}
        >
          <Crosshair size={18} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="filter-panel"
          className="relative grid size-11 shrink-0 place-items-center rounded-full bg-white text-ink-soft ring-1 ring-inset ring-line"
        >
          <SlidersHorizontal size={18} aria-hidden />
          <span className="sr-only">Filters</span>
          {active > 0 && (
            <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-ink text-[11px] font-semibold text-white tabular-nums">
              {active}
            </span>
          )}
        </button>
      </div>

      {open && (
        <div id="filter-panel" className="space-y-4 rounded-2xl border border-line bg-white/90 p-4">
          <fieldset>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink-soft">Category</legend>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <button key={c.slug} type="button" aria-pressed={value.categories.includes(c.slug)} className={chip(value.categories.includes(c.slug))} onClick={() => onChange({ ...value, categories: toggle(value.categories, c.slug) })}>
                  {c.name}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-ink-soft">Status</legend>
            <div className="flex flex-wrap gap-2">
              {FILTERABLE.map((s) => (
                <button key={s} type="button" aria-pressed={value.statuses.includes(s)} className={chip(value.statuses.includes(s))} onClick={() => onChange({ ...value, statuses: toggle(value.statuses, s) })}>
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-faint">With no status selected, only open incidents are shown.</p>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-soft">
              From
              <input type="date" value={value.from} max={value.to || undefined} onChange={(e) => onChange({ ...value, from: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-line bg-white px-3 text-sm font-normal normal-case tracking-normal text-ink" />
            </label>
            <label className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-soft">
              To
              <input type="date" value={value.to} min={value.from || undefined} onChange={(e) => onChange({ ...value, to: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-line bg-white px-3 text-sm font-normal normal-case tracking-normal text-ink" />
            </label>
          </div>
          {active > 0 && (
            <button type="button" onClick={() => onChange({ ...EMPTY_FILTERS, q: value.q })} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-focus">
              <X size={14} aria-hidden /> Clear filters
            </button>
          )}
        </div>
      )}
    </section>
  )
}
