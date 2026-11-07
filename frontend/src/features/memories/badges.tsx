import { Badge } from '@/components/ui/badge'

import { CATEGORY_LABEL, SOURCE_TYPE_LABEL, STATUS_LABEL, subjectLabel, type Category, type MemoryStatus, type SourceRef } from './schema'

const STATUS_VARIANT = {
  active: 'success',
  pending: 'warning',
  conflicted: 'destructive',
  archived: 'secondary',
  rejected: 'secondary',
  expired: 'secondary',
} as const

export const StatusBadge = ({ status }: { status: MemoryStatus }) => (
  <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
)

export const CategoryBadge = ({ category }: { category: Category }) => (
  <Badge variant="outline">{CATEGORY_LABEL[category]?.split(' ')[0] ?? category}</Badge>
)

export function SourceLabel({ source }: { source: SourceRef | null }) {
  // 來源已刪除或無法存取時明確顯示
  if (!source) return <span className="text-muted-foreground italic">來源已刪除</span>
  return (
    <span className="truncate" title={source.name}>
      {SOURCE_TYPE_LABEL[source.type] ?? source.type}
      {source.status !== 'available' && <span className="text-destructive"> · 無法存取</span>}
    </span>
  )
}

export function VisibilityList({ visibility }: { visibility: string[] }) {
  if (!visibility.length) return <span className="text-muted-foreground text-xs">僅自己（AI 不可讀）</span>
  return (
    <div className="flex flex-wrap gap-1">
      {visibility.map((s) => (
        <Badge key={s} variant="secondary">
          {subjectLabel(s)}
        </Badge>
      ))}
    </div>
  )
}
