import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthContext'
import { api, errorMessage } from '@/lib/api'
import type { Role } from '@/lib/types'

interface AdminUser {
  id: number
  email: string | null
  displayName: string
  role: Role
  reputation: number
  isBanned: boolean
}

export function UsersPanel() {
  const { me } = useAuth()
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['admin-users'], queryFn: () => api<{ users: AdminUser[] }>('/admin/users') })
  const update = useMutation({
    mutationFn: (v: { id: number; role?: Role; isBanned?: boolean }) => api(`/admin/users/${v.id}`, { method: 'PATCH', body: { role: v.role, isBanned: v.isBanned } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-users'] }),
    onError: (e) => toast.error(errorMessage(e)),
  })

  return (
    <ul className="space-y-2">
      {data?.users.map((u) => (
        <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white/80 p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{u.displayName}{u.isBanned && <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800">Suspended</span>}</p>
            <p className="truncate text-xs text-ink-faint">{u.email}</p>
          </div>
          {u.id !== me?.id && (
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor={`role-${u.id}`}>Role for {u.displayName}</label>
              <select id={`role-${u.id}`} value={u.role} onChange={(e) => update.mutate({ id: u.id, role: e.target.value as Role })} className="h-11 rounded-xl border border-line bg-white px-2 text-sm">
                <option value="user">User</option>
                <option value="moderator">Moderator</option>
                <option value="admin">Admin</option>
              </select>
              <button type="button" onClick={() => update.mutate({ id: u.id, isBanned: !u.isBanned })} className="min-h-11 rounded-full bg-white px-4 text-sm font-medium ring-1 ring-inset ring-line">
                {u.isBanned ? 'Restore' : 'Suspend'}
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
