import type { ReactNode } from 'react'
import { Pencil, Trash2 } from 'lucide-react'

import { ErrorState } from '@/components/common/states'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime } from '@/lib/format'

import { useProject } from './api'
import { PriorityBadge, StatusBadge } from './project-badges'
import type { Project } from './schema'

interface Props {
  id: string | null
  onClose: () => void
  onEdit?: (p: Project) => void
  onDelete?: (p: Project) => void
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6rem_1fr] items-start gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="min-w-0 break-words">{children}</div>
    </div>
  )
}

/** 右側詳細資訊面板（Inspector），由網址 ?selected=<id> 控制開關 */
export function ProjectDetailSheet({ id, onClose, onEdit, onDelete }: Props) {
  const q = useProject(id)
  const p = q.data
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{p?.name ?? (q.isLoading ? '載入中…' : '專案')}</SheetTitle>
          <SheetDescription>{id}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 overflow-y-auto px-4">
          {q.isLoading ? (
            Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-5 w-full" />)
          ) : q.error ? (
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          ) : p ? (
            <>
              <Row label="狀態">
                <StatusBadge status={p.status} />
              </Row>
              <Row label="優先度">
                <PriorityBadge priority={p.priority} />
              </Row>
              <Row label="負責人">{p.owner}</Row>
              <Row label="說明">{p.description || <span className="text-muted-foreground">—</span>}</Row>
              <Separator />
              <Row label="建立時間">{formatDateTime(p.created_at)}</Row>
              <Row label="更新時間">{formatDateTime(p.updated_at)}</Row>
            </>
          ) : null}
        </div>
        {p && (onEdit || onDelete) && (
          <SheetFooter className="flex-row justify-end border-t">
            {onDelete && (
              <Button variant="outline" onClick={() => onDelete(p)}>
                <Trash2 /> 刪除
              </Button>
            )}
            {onEdit && (
              <Button onClick={() => onEdit(p)}>
                <Pencil /> 編輯
              </Button>
            )}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
