/** Accessible on/off switch with a visible label and optional description. */
export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        {description && <p className="mt-0.5 text-pretty text-xs text-ink-soft">{description}</p>}
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} className="grid min-h-11 min-w-14 shrink-0 place-items-center disabled:opacity-50">
        <span className={`relative h-7 w-12 rounded-full transition-colors ${checked ? 'bg-ink' : 'bg-stone-300'}`}>
          <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-[left] ${checked ? 'left-[22px]' : 'left-0.5'}`} />
        </span>
      </button>
    </div>
  )
}
