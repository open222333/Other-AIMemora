import type { ColumnDef, RowSelectionState } from '@tanstack/react-table'
import { Eye, MoreHorizontal, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { PageHeader } from '@/components/common/page-header'
import { ColumnHeader } from '@/components/data-table/column-header'
import { DataTable } from '@/components/data-table/data-table'
import { FacetedFilter } from '@/components/data-table/faceted-filter'
import { selectionColumn } from '@/components/data-table/selection-column'
import { ViewOptions } from '@/components/data-table/view-options'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { hasRole, useAuth } from '@/features/auth/store'
import { useDeleteProjects, useProjects } from '@/features/projects/api'
import { PriorityBadge, StatusBadge } from '@/features/projects/project-badges'
import { ProjectDetailSheet } from '@/features/projects/project-detail-sheet'
import { ProjectFormDialog } from '@/features/projects/project-form-dialog'
import { PRIORITY_LABEL, PROJECT_PRIORITY, PROJECT_STATUS, STATUS_LABEL, type Project } from '@/features/projects/schema'
import { useDebouncedValue } from '@/hooks/use-debounce'
import { useListParams } from '@/hooks/use-list-params'
import { formatDateTime, formatRelative } from '@/lib/format'

const statusOptions = PROJECT_STATUS.map((s) => ({ value: s, label: STATUS_LABEL[s] }))
const priorityOptions = PROJECT_PRIORITY.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))

export function ProjectsPage() {
  const { params, update, searchParams, setExtra } = useListParams({
    sort: 'updated_at',
    order: 'desc',
    filters: ['status', 'priority'],
  })
  const canEdit = hasRole(useAuth((s) => s.user), 'admin', 'operator')
  const query = useProjects(params)
  const del = useDeleteProjects()

  // 搜尋框：輸入時即時顯示，300ms 後才更新網址與查詢
  const [search, setSearch] = useState(params.q ?? '')
  const debounced = useDebouncedValue(search)
  useEffect(() => {
    if ((params.q ?? '') !== debounced) update({ q: debounced || undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const [selection, setSelection] = useState<RowSelectionState>({})
  const [editing, setEditing] = useState<Project | null>(null)
  const [formOpen, setFormOpen] = useState(searchParams.get('new') === '1')
  const [toDelete, setToDelete] = useState<Project[] | null>(null)
  const selectedId = searchParams.get('selected')

  // 篩選或換頁後清除勾選，避免誤刪不在畫面上的資料
  useEffect(() => setSelection({}), [params])

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (p: Project) => {
    setEditing(p)
    setFormOpen(true)
  }

  const columns = useMemo<ColumnDef<Project>[]>(
    () => [
      ...(canEdit ? [selectionColumn<Project>()] : []),
      {
        accessorKey: 'name',
        meta: { label: '名稱' },
        enableHiding: false,
        header: ({ column }) => <ColumnHeader column={column} title="名稱" />,
        cell: ({ row }) => (
          <div className="max-w-[20rem]">
            <div className="truncate font-medium">{row.original.name}</div>
            <div className="text-muted-foreground text-xs">{row.original.id}</div>
          </div>
        ),
      },
      {
        accessorKey: 'status',
        meta: { label: '狀態' },
        header: ({ column }) => <ColumnHeader column={column} title="狀態" />,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'priority',
        meta: { label: '優先度' },
        header: ({ column }) => <ColumnHeader column={column} title="優先度" />,
        cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
      },
      {
        accessorKey: 'owner',
        meta: { label: '負責人' },
        header: ({ column }) => <ColumnHeader column={column} title="負責人" />,
      },
      {
        accessorKey: 'updated_at',
        meta: { label: '更新時間' },
        header: ({ column }) => <ColumnHeader column={column} title="更新時間" />,
        cell: ({ row }) => (
          <span title={formatDateTime(row.original.updated_at)} className="text-muted-foreground">
            {formatRelative(row.original.updated_at)}
          </span>
        ),
      },
      {
        id: 'actions',
        enableHiding: false,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="操作">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setExtra('selected', row.original.id)}>
                  <Eye /> 檢視
                </DropdownMenuItem>
                {canEdit && (
                  <>
                    <DropdownMenuItem onClick={() => openEdit(row.original)}>
                      <Pencil /> 編輯
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setToDelete([row.original])}>
                      <Trash2 className="text-destructive" /> 刪除
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [canEdit, setExtra],
  )

  const rows = query.data?.items
  const selectedRows = rows?.filter((r) => selection[r.id]) ?? []
  const hasFilters = !!(params.q || params.status || params.priority)

  return (
    <>
      <PageHeader
        title="專案"
        description="資料表格範例：伺服器端分頁、排序、篩選，網址同步"
        actions={
          canEdit && (
            <Button onClick={openCreate}>
              <Plus /> 新增專案
            </Button>
          )
        }
      />

      <DataTable
        tableId="projects"
        columns={columns}
        data={rows}
        total={query.data?.total ?? 0}
        params={params}
        onParamsChange={update}
        getRowId={(r) => r.id}
        isLoading={query.isLoading}
        isFetching={query.isFetching}
        error={query.error}
        onRetry={() => query.refetch()}
        rowSelection={selection}
        onRowSelectionChange={setSelection}
        onRowClick={(r) => setExtra('selected', r.id)}
        toolbar={(table) => (
          <>
            <div className="relative w-full sm:w-64">
              <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                placeholder="搜尋名稱或負責人…"
                className="h-8 pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="搜尋"
              />
            </div>
            <FacetedFilter title="狀態" options={statusOptions} value={params.status as string} onChange={(v) => update({ status: v })} />
            <FacetedFilter title="優先度" options={priorityOptions} value={params.priority as string} onChange={(v) => update({ priority: v })} />
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('')
                  update({ q: undefined, status: undefined, priority: undefined })
                }}
              >
                重設 <X />
              </Button>
            )}
            {selectedRows.length > 0 && (
              <Button variant="destructive" size="sm" onClick={() => setToDelete(selectedRows)}>
                <Trash2 /> 刪除 {selectedRows.length} 筆
              </Button>
            )}
            <ViewOptions table={table} />
          </>
        )}
      />

      <ProjectDetailSheet
        id={selectedId}
        onClose={() => setExtra('selected', null)}
        onEdit={canEdit ? openEdit : undefined}
        onDelete={canEdit ? (p) => setToDelete([p]) : undefined}
      />

      <ProjectFormDialog
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o)
          if (!o && searchParams.get('new')) setExtra('new', null)
        }}
        project={editing}
      />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`刪除 ${toDelete?.length ?? 0} 筆專案？`}
        description={
          toDelete?.length === 1 ? `「${toDelete[0].name}」將被永久刪除，無法復原。` : '選取的專案將被永久刪除，無法復原。'
        }
        confirmText="刪除"
        destructive
        onConfirm={() => {
          const ids = toDelete!.map((p) => p.id)
          del.mutate(ids, {
            onSuccess: () => {
              setSelection({})
              if (selectedId && ids.includes(selectedId)) setExtra('selected', null)
            },
          })
          setToDelete(null)
        }}
      />
    </>
  )
}
