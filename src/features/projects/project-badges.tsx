import { Badge } from '@/components/ui/badge'

import { PRIORITY_LABEL, STATUS_LABEL, type Project } from './schema'

const STATUS_VARIANT = { active: 'success', paused: 'warning', archived: 'secondary' } as const
const PRIORITY_VARIANT = { high: 'destructive', medium: 'outline', low: 'secondary' } as const

export const StatusBadge = ({ status }: { status: Project['status'] }) => (
  <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
)

export const PriorityBadge = ({ priority }: { priority: Project['priority'] }) => (
  <Badge variant={PRIORITY_VARIANT[priority]}>{PRIORITY_LABEL[priority]}</Badge>
)
