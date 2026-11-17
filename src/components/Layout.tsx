import { useQuery } from '@tanstack/react-query'
import { Bell, CircleHelp, House, Map as MapIcon, Plus, ShieldAlert, ShieldCheck, User, WifiOff } from 'lucide-react'
import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthContext'
import { useOnline } from '@/hooks/useOnline'
import { useRealtime } from '@/hooks/useRealtime'
import { api } from '@/lib/api'
import { flushQueue, useQueuedCount } from '@/lib/reportQueue'

const navItem = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${isActive ? 'text-ink' : 'text-ink-faint'}`

export function Layout() {
  const { me, status } = useAuth()
  const online = useOnline()
  const queued = useQueuedCount()
  useRealtime()

  const { data: notif } = useQuery({
    queryKey: ['notifications', 'unread'],
    enabled: status === 'signedIn',
    refetchInterval: 60_000,
    queryFn: () => api<{ unread: number }>('/notifications'),
  })
  const unread = notif?.unread ?? 0

  // Send reports that were saved while offline as soon as we can.
  useEffect(() => {
    if (!online || !me || queued === 0) return
    void flushQueue(me.id).then((r) => {
      if (r.sent) toast.success(`${r.sent} saved report${r.sent > 1 ? 's' : ''} sent`)
      if (r.rejected) toast.error(`${r.rejected} saved report${r.rejected > 1 ? 's were' : ' was'} rejected by the server`)
    })
  }, [online, me, queued])

  const isStaff = me?.role === 'admin' || me?.role === 'moderator'

  return (
    <div className="mx-auto flex h-dvh max-w-3xl flex-col bg-canvas">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
        <NavLink to="/" className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-ink">
          <Logo size={30} /> RoadWatch
        </NavLink>
        <div className="flex items-center">
        {isStaff && (
          <NavLink to="/admin" className="grid size-11 place-items-center rounded-full text-ink" aria-label="Review dashboard"><ShieldCheck size={20} aria-hidden /></NavLink>
        )}
        <NavLink to="/help" className="grid size-11 place-items-center rounded-full text-ink" aria-label="Help and safety"><CircleHelp size={20} aria-hidden /></NavLink>
        <NavLink to="/notifications" className="relative grid size-11 place-items-center rounded-full text-ink" aria-label={`Alerts${unread ? `, ${unread} unread` : ''}`}>
          <Bell size={20} aria-hidden />
          {unread > 0 && <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-sev-high px-1 text-[10px] font-bold text-white tabular-nums">{unread}</span>}
        </NavLink>
        </div>
      </header>

      {!online && (
        <div role="status" className="flex items-center gap-2 bg-ink px-4 py-2 text-sm text-white">
          <WifiOff size={14} aria-hidden /> You are offline. Showing saved information; new reports are stored on this device and sent later.
        </div>
      )}
      {queued > 0 && (
        <div role="status" className="bg-amber-100 px-4 py-2 text-sm text-amber-900 tabular-nums">
          {queued} report{queued > 1 ? 's' : ''} waiting to be sent{me ? '' : '. Sign in to send them'}.
        </div>
      )}

      <main className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>

      <nav aria-label="Primary" className="flex shrink-0 items-end border-t border-line bg-white/90 pb-[env(safe-area-inset-bottom)]">
        <NavLink to="/" end className={navItem}>
          <House size={20} aria-hidden /> Home
        </NavLink>
        <NavLink to="/map" className={navItem}>
          <MapIcon size={20} aria-hidden /> Map
        </NavLink>
        <NavLink to="/report" className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-ink">
          <span className="-mt-5 grid size-12 place-items-center rounded-full bg-ink text-white shadow-lg"><Plus size={22} aria-hidden /></span>
          Report
        </NavLink>
        <NavLink to="/safety" className={navItem}>
          <ShieldAlert size={20} aria-hidden /> Safety
        </NavLink>
        <NavLink to="/account" className={navItem}>
          <User size={20} aria-hidden /> Account
        </NavLink>
      </nav>
    </div>
  )
}
