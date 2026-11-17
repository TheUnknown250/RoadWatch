import { Loader2, MapPin, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, errorMessage } from '@/lib/api'
import type { PlaceResult } from '@/lib/types'

/** Search for a place in Nigeria. Waits for a pause in typing so the shared geocoder is not hammered. */
export function PlaceSearch({ label, onSelect, placeholder = 'Search a place, road or landmark' }: { label: string; onSelect: (p: PlaceResult) => void; placeholder?: string }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<PlaceResult[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const term = q.trim()
    if (term.length < 3) return
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      setBusy(true)
      setError('')
      api<{ places: PlaceResult[] }>(`/places/search?q=${encodeURIComponent(term)}`, { auth: false, signal: ctrl.signal })
        .then((r) => {
          setResults(r.places)
          if (!r.places.length) setError('No places found. Try a different spelling or add the town.')
        })
        .catch((e: unknown) => {
          if (!(e instanceof DOMException)) setError(errorMessage(e))
        })
        .finally(() => setBusy(false))
    }, 600)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [q])

  return (
    <div className="space-y-2">
      <label className="relative block">
        <span className="sr-only">{label}</span>
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
        <input type="search" value={q} onChange={(e) => { setQ(e.target.value); if (e.target.value.trim().length < 3) { setResults([]); setError('') } }} placeholder={placeholder} className="h-12 w-full rounded-xl border border-line bg-white pl-10 pr-10 text-base" />
        {busy && <Loader2 size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-ink-faint" aria-hidden />}
      </label>
      {error && <p role="status" className="text-sm text-ink-soft">{error}</p>}
      {results.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
          {results.map((p) => (
            <li key={`${p.lat},${p.lng},${p.label}`}>
              <button type="button" onClick={() => { onSelect(p); setResults([]); setQ('') }} className="flex min-h-12 w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-canvas">
                <MapPin size={15} className="mt-0.5 shrink-0 text-ink-faint" aria-hidden />
                <span className="text-pretty">{p.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
