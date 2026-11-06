import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatNumber } from '@/lib/format'

interface Props {
  page: number
  pageSize: number
  total: number
  selected?: number
  pageSizeOptions?: number[]
  onChange: (p: { page?: number; pageSize?: number }) => void
}

export function DataTablePagination({ page, pageSize, total, selected = 0, pageSizeOptions = [10, 20, 50, 100], onChange }: Props) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-sm">
      <div className="text-muted-foreground">
        {selected > 0 ? `已選 ${selected} 筆，` : ''}共 {formatNumber(total)} 筆
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground hidden sm:inline">每頁</span>
          <Select value={String(pageSize)} onValueChange={(v) => onChange({ pageSize: Number(v) })}>
            <SelectTrigger size="sm" className="w-18" aria-label="每頁筆數">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="tabular-nums">
          第 {Math.min(page, pageCount)} / {pageCount} 頁
        </span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label="第一頁" disabled={page <= 1} onClick={() => onChange({ page: 1 })}>
            <ChevronsLeft />
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="上一頁" disabled={page <= 1} onClick={() => onChange({ page: page - 1 })}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="下一頁" disabled={page >= pageCount} onClick={() => onChange({ page: page + 1 })}>
            <ChevronRight />
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="最後一頁" disabled={page >= pageCount} onClick={() => onChange({ page: pageCount })}>
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  )
}
