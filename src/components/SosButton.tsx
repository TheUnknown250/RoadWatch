import { ShieldAlert } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

const HOLD_MS = 1500

/**
 * Press-and-hold SOS control, so a pocket touch cannot send an alert.
 * Keyboard and screen-reader users get a confirmation step instead of a timed hold.
 */
export function SosButton({ onTrigger, busy }: { onTrigger: () => void; busy: boolean }) {
  const [progress, setProgress] = useState(0)
  const [confirm, setConfirm] = useState(false)
  const timer = useRef<number | null>(null)
  const startedAt = useRef(0)

  function stop() {
    if (timer.current !== null) window.clearInterval(timer.current)
    timer.current = null
    setProgress(0)
  }
  useEffect(() => stop, [])

  function begin() {
    if (busy || timer.current !== null) return
    startedAt.current = performance.now()
    timer.current = window.setInterval(() => {
      const p = Math.min(1, (performance.now() - startedAt.current) / HOLD_MS)
      setProgress(p)
      if (p >= 1) {
        stop()
        onTrigger()
      }
    }, 40)
  }

  function onKeyDown(e: KeyboardEvent) {
    if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
      e.preventDefault()
      setConfirm(true)
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        disabled={busy}
        onPointerDown={begin}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={onKeyDown}
        aria-label="Send SOS. Press and hold, or press Enter to confirm."
        className="relative grid size-44 touch-none select-none place-items-center rounded-full text-white shadow-lg disabled:opacity-60"
        style={{ background: `conic-gradient(#fff ${progress * 360}deg, #7f1d1d 0deg)` }}
      >
        <span className="grid size-[10.25rem] place-items-center rounded-full bg-red-600">
          <span className="text-center">
            <ShieldAlert size={40} className="mx-auto" aria-hidden />
            <span className="mt-1 block font-display text-2xl font-bold tracking-wide">SOS</span>
            <span className="block text-xs font-medium opacity-90">{busy ? 'Sending' : progress > 0 ? 'Keep holding' : 'Hold to send'}</span>
          </span>
        </span>
      </button>
      {confirm && (
        <div role="alertdialog" aria-label="Confirm SOS" className="w-full max-w-sm space-y-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-center">
          <p className="font-semibold text-red-900">Send an SOS to your communities now?</p>
          <div className="flex justify-center gap-2">
            <button type="button" autoFocus onClick={() => { setConfirm(false); onTrigger() }} className="min-h-12 rounded-full bg-red-600 px-6 font-semibold text-white">Send SOS</button>
            <button type="button" onClick={() => setConfirm(false)} className="min-h-12 rounded-full bg-white px-6 font-semibold ring-1 ring-inset ring-line">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
