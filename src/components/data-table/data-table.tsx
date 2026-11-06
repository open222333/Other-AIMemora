/**
 * 伺服器端分頁 / 排序的資料表格（TanStack Table）
 * - 分頁、排序狀態來自 useListParams（網址），變更時呼叫 onParamsChange
 * - 欄位顯示設定存 localStorage（依 tableId）
 * - 載入中顯示骨架、錯誤顯示重試、無資料顯示空狀態
 */
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { useEffect, useState, type ReactNode } from 'react'

import { EmptyState, ErrorState } from '@/components/common/states'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ListParams } from '@/api/types'
import { cn } from '@/lib/utils'

import { DataTablePagination } from './pagination'

interface Props<T> {
  tableId: string
  columns: ColumnDef<T>[]
  data: T[] | undefined
  total: number
  params: ListParams
  onParamsChange: (patch: Partial<ListParams>) => void
  getRowId: (row: T) => string
  isLoading?: boolean
  isFetching?: boolean
  error?: unknown
  onRetry?: () => void
  rowSelection?: RowSelectionState
  onRowSelectionChange?: (s: RowSelectionState) => void
  onRowClick?: (row: T) => void
  /** 表格上方工具列，可取得 table 實例（用於 ViewOptions） */
  toolbar?: (table: ReturnType<typeof useReactTable<T>>) => ReactNode
  empty?: ReactNode
}

function loadVisibility(id: string): VisibilityState {
  try {
    return JSON.parse(localStorage.getItem(`table:${id}:columns`) ?? '{}')
  } catch {
    return {}
  }
}

export function DataTable<T>(props: Props<T>) {
  const { tableId, columns, data, total, params, onParamsChange, getRowId, isLoading, isFetching, error } = props
  const [visibility, setVisibility] = useState<VisibilityState>(() => loadVisibility(tableId))
  const [localSelection, setLocalSelection] = useState<RowSelectionState>({})
  const rowSelection = props.rowSelection ?? localSelection
  const setRowSelection = props.onRowSelectionChange ?? setLocalSelection

  useEffect(() => {
    try {
      localStorage.setItem(`table:${tableId}:columns`, JSON.stringify(visibility))
    } catch {
      /* ignore */
    }
  }, [tableId, visibility])

  const sorting: SortingState = params.sort ? [{ id: params.sort, desc: params.order !== 'asc' }] : []
  const pageSize = params.pageSize ?? 10

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table 與 React Compiler 的已知限制，不影響使用
  const table = useReactTable<T>({
    data: data ?? [],
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    rowCount: total,
    state: { sorting, columnVisibility: visibility, rowSelection, pagination: { pageIndex: (params.page ?? 1) - 1, pageSize } },
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater
      onParamsChange(next[0] ? { sort: next[0].id, order: next[0].desc ? 'desc' : 'asc' } : { sort: undefined, order: undefined })
    },
    onColumnVisibilityChange: setVisibility,
    onRowSelectionChange: (updater) => setRowSelection(typeof updater === 'function' ? updater(rowSelection) : updater),
    enableRowSelection: true,
  })

  const colCount = table.getVisibleLeafColumns().length

  return (
    <div className="flex flex-col gap-3">
      {props.toolbar && <div className="flex flex-wrap items-center gap-2">{props.toolbar(table)}</div>}
      <div className={cn('rounded-md border transition-opacity', isFetching && !isLoading && 'opacity-70')}>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id} style={h.column.id === 'select' ? { width: 32 } : undefined}>
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: Math.min(pageSize, 8) }, (_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: colCount }, (_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : error ? (
              <TableRow>
                <TableCell colSpan={colCount}>
                  <ErrorState error={error} onRetry={props.onRetry} />
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colCount}>{props.empty ?? <EmptyState description="試著調整搜尋或篩選條件" />}</TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className={props.onRowClick ? 'cursor-pointer' : undefined}
                  onClick={() => props.onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination
        page={params.page ?? 1}
        pageSize={pageSize}
        total={total}
        selected={Object.keys(rowSelection).length}
        onChange={onParamsChange}
      />
    </div>
  )
}
