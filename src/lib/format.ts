import type { IncidentStatus } from './types'

export const STATUS_LABEL: Record<IncidentStatus, string> = {
  pending: 'Awaiting confirmation',
  verified: 'Verified',
  disputed: 'Disputed',
  resolved: 'Resolved',
  rejected: 'Rejected',
  expired: 'Expired',
  withdrawn: 'Withdrawn',
}

export const STATUS_STYLE: Record<IncidentStatus, string> = {
  pending: 'bg-slate-100 text-slate-700 ring-slate-200',
  verified: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  disputed: 'bg-orange-50 text-orange-800 ring-orange-200',
  resolved: 'bg-sky-50 text-sky-800 ring-sky-200',
  rejected: 'bg-red-50 text-red-800 ring-red-200',
  expired: 'bg-stone-100 text-stone-600 ring-stone-200',
  withdrawn: 'bg-stone-100 text-stone-600 ring-stone-200',
}

export const SEVERITY_COLOR = ['#7A8499', '#B7791F', '#C2410C', '#B91C1C']

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return `${d} d ago`
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`
}

/** Value for <input type="datetime-local"> in the user's local time. */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

import type { ScanLevel } from './types'

export const LEVEL_STYLE: Record<ScanLevel, { label: string; color: string; panel: string }> = {
  safe: { label: 'Low risk', color: '#15803D', panel: 'bg-emerald-50 text-emerald-900' },
  caution: { label: 'Use caution', color: '#B7791F', panel: 'bg-amber-50 text-amber-900' },
  elevated: { label: 'Elevated risk', color: '#C2410C', panel: 'bg-orange-50 text-orange-900' },
  danger: { label: 'High risk', color: '#B91C1C', panel: 'bg-red-50 text-red-900' },
}

export function formatDuration(seconds: number): string {
  const m = Math.max(1, Math.round(seconds / 60))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h} h ${m % 60} min`
}

export function formatKm(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`
}

export function formatClock(iso: string): string {
  return new Intl.DateTimeFormat('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Lagos' }).format(new Date(iso))
}
