import { LEVEL_STYLE } from '@/lib/format'
import type { ScanLevel } from '@/lib/types'

/** Circular score gauge. The level is also spelled out so colour is never the only signal. */
export function ScoreRing({ score, level, size = 132, onDark = false }: { score: number; level: ScanLevel; size?: number; onDark?: boolean }) {
  const r = 52
  const c = 2 * Math.PI * r
  const { color, label } = LEVEL_STYLE[level]
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Safety score ${score} out of 100. ${label}.`}>
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke={onDark ? 'rgba(255,255,255,0.18)' : '#E3DFD5'} strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} style={{ transition: 'stroke-dashoffset 600ms ease' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className={`font-display font-bold leading-none tabular-nums ${onDark ? 'text-white' : 'text-ink'}`} style={{ fontSize: Math.round(size * (score >= 100 ? 0.27 : 0.32)) }}>{score}</p>
          <p className={`mt-0.5 font-semibold uppercase tracking-[0.08em] ${onDark ? 'text-white/70' : 'text-ink-soft'}`} style={{ fontSize: Math.max(8, Math.round(size * 0.085)) }}>of 100</p>
        </div>
      </div>
    </div>
  )
}
