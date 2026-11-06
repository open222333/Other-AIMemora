import type { Column } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** 可排序欄位標題：點擊在 遞減 → 遞增 → 取消 之間切換 */
export function ColumnHeader<T>({ column, title, className }: { column: Column<T>; title: string; className?: string }) {
  if (!column.getCanSort()) return <div className={className}>{title}</div>
  const sorted = column.getIsSorted()
  const Icon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ChevronsUpDown
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('-ml-2 h-8', className)}
      onClick={() => (sorted === 'asc' ? column.clearSorting() : column.toggleSorting(sorted !== 'desc'))}
    >
      {title}
      <Icon className={cn('size-3.5', !sorted && 'text-muted-foreground/60')} />
    </Button>
  )
}
