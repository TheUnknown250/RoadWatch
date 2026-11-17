import { BadgeCheck, Ban, CheckCheck, Clock, Flag, Hourglass, Undo2 } from 'lucide-react'
import { STATUS_LABEL, STATUS_STYLE } from '@/lib/format'
import type { IncidentStatus } from '@/lib/types'

const ICON = { pending: Clock, verified: BadgeCheck, disputed: Flag, resolved: CheckCheck, rejected: Ban, expired: Hourglass, withdrawn: Undo2 }

export function StatusBadge({ status }: { status: IncidentStatus }) {
  const Icon = ICON[status]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[status]}`}>
      <Icon size={12} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  )
}
