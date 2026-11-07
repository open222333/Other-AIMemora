import type { ColumnDef, RowSelectionState } from '@tanstack/react-table'
import { Archive, Check, Eye, MoreHorizontal, Pencil, Plus, Search, Sparkles, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'

import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState, ErrorState } from '@/components/common/states'
import { ColumnHeader } from '@/components/data-table/column-header'
import { DataTable } from '@/components/data-table/data-table'
import { FacetedFilter } from '@/components/data-table/faceted-filter'
import { selectionColumn } from '@/components/data-table/selection-column'
import { ViewOptions } from '@/components/data-table/view-options'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { hasRole, useAuth } from '@/features/auth/store'
import { useDeleteMemories, useMemories, useSearch, useSetStatus } from '@/features/memories/api'
import { CategoryBadge, SourceLabel, StatusBadge } from '@/features/memories/badges'
import { MemoryFormDialog } from '@/features/memories/memory-form-dialog'
import { MemoryInspector } from '@/features/memories/memory-inspector'
import { CATEGORIES, CATEGORY_LABEL, SOURCE_TYPE_LABEL, STATUS_LABEL, STATUSES, type Memory } from '@/features/memories/schema'
import { useWorkspaceSettings } from '@/features/system/api'
import { useDebouncedValue } from '@/hooks/use-debounce'
import { useListParams } from '@/hooks/use-list-params'
import { formatDateTime, formatRelative } from '@/lib/format'

const statusOptions = STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))
const categoryOptions = CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))
const sourceOptions = ['manual', 'api', 'import', 'chatgpt', 'claude', 'gemini', 'deepseek'].map((s) => ({
  value: s,
  label: SOURCE_TYPE_LABEL[s],
}))

type SearchMode = 'filter' | 'hybrid' | 'keyword' | 'semantic'
const SEARCH_MODES: { value: SearchMode; label: string }[] = [
  { value: 'filter', label: '列表篩選' },
  { value: 'hybrid', label: '智慧搜尋（Hybrid）' },
  { value: 'keyword', label: '關鍵字搜尋' },
  { value: 'semantic', label: '語意搜尋' },
]

/** 智慧搜尋結果：依相關性排序（不分頁） */
function SearchResults({ query, mode, category, onSelect }: { query: string; mode: Exclude<SearchMode, 'filter'>; category?: string; onSelect: (id: string) => void }) {
  const q = useSearch(query ? { query, mode, limit: 30, category: category ? category.split(',') : undefined } : null)
  if (!query) return <EmptyState title="輸入關鍵字開始搜尋" description="Hybrid 會同時使用精確關鍵字與語意相似度" />
  if (q.isLoading) return <Skeleton className="h-40 w-full" />
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const r = q.data
  return (
    <div className="flex flex-col gap-2">
      {!r?.semantic_available && mode !== 'keyword' && (
        <p className="text-muted-foreground text-xs">
          尚未啟用 Embedding，目前只使用關鍵字搜尋。可在 <code>.env</code> 設定 <code>MEMORA_EMBEDDING_PROVIDER</code>（例如本機 Ollama）。
        </p>
      )}
      {!r?.items.length ? (
        <Card>
          <EmptyState title="沒有找到相關記憶" />
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {r.items.map((h) => (
            <li key={h.memory.id}>
              <button
                className="bg-card hover:border-primary/40 w-full rounded-lg border p-3 text-left transition-colors"
                onClick={() => onSelect(h.memory.id)}
              >
                <div className="text-sm">{h.memory.content}</div>
                <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <CategoryBadge category={h.memory.category} />
                  <StatusBadge status={h.memory.status} />
                  {h.matched_by.map((m) => (
                    <Badge key={m} variant="secondary">
                      {m === 'keyword' ? '關鍵字命中' : '語意相似'}
                    </Badge>
                  ))}
                  <span className="ml-auto tabular-nums">score {h.score.toFixed(4)}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function MemoriesPage({ review = false }: { review?: boolean }) {
  const { params, update, searchParams, setExtra } = useListParams({
    sort: 'updated_at',
    order: 'desc',
    pageSize: 20,
    filters: review ? [] : ['status', 'category', 'source_type', 'source_id', 'tag', 'mode'],
  })
  const listParams = useMemo(() => {
    const { mode: _mode, ...rest } = params
    return review ? { ...rest, status: 'pending' } : rest
  }, [params, review])
  const mode = ((!review && (params.mode as SearchMode)) || 'filter') as SearchMode
  const canEdit = hasRole(useAuth((s) => s.user), 'admin')
  const query = useMemories(listParams)
  const settings = useWorkspaceSettings()
  const del = useDeleteMemories()
  const setStatus = useSetStatus()

  const [search, setSearch] = useState(params.q ?? '')
  const debounced = useDebouncedValue(search)
  useEffect(() => {
    if ((params.q ?? '') !== debounced) update({ q: debounced || undefined })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const [selection, setSelection] = useState<RowSelectionState>({})
  const [editing, setEditing] = useState<Memory | null>(null)
  const [formOpen, setFormOpen] = useState(searchParams.get('new') === '1')
  const [toDelete, setToDelete] = useState<Memory[] | null>(null)
  const selectedId = searchParams.get('selected')
  useEffect(() => setSelection({}), [params])

  const openEdit = (m: Memory) => {
    setEditing(m)
    setFormOpen(true)
  }

  const columns = useMemo<ColumnDef<Memory>[]>(
    () => [
      ...(canEdit ? [selectionColumn<Memory>()] : []),
      {
        accessorKey: 'content',
        meta: { label: '內容' },
        enableHiding: false,
        header: ({ column }) => <ColumnHeader column={column} title="內容" />,
        cell: ({ row }) => (
          <div className="max-w-[28rem] min-w-[14rem]">
            <div className="line-clamp-2 text-sm">{row.original.content}</div>
            {row.original.tags.length > 0 && (
              <div className="text-muted-foreground mt-0.5 truncate text-xs">{row.original.tags.map((t) => `#${t}`).join(' ')}</div>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'category',
        meta: { label: '分類' },
        header: ({ column }) => <ColumnHeader column={column} title="分類" />,
        cell: ({ row }) => <CategoryBadge category={row.original.category} />,
      },
      {
        accessorKey: 'status',
        meta: { label: '狀態' },
        header: ({ column }) => <ColumnHeader column={column} title="狀態" />,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            <StatusBadge status={row.original.status} />
            {row.original.proposal_for && <Badge variant="outline">修改提案</Badge>}
          </div>
        ),
      },
      {
        id: 'source',
        meta: { label: '來源' },
        enableSorting: false,
        header: '來源',
        cell: ({ row }) => (
          <div className="max-w-[10rem] text-sm">
            <SourceLabel source={row.original.source} />
          </div>
        ),
      },
      {
        accessorKey: 'confidence',
        meta: { label: '可信度' },
        header: ({ column }) => <ColumnHeader column={column} title="可信度" />,
        cell: ({ row }) => <span className="tabular-nums">{Math.round(row.original.confidence * 100)}%</span>,
      },
      {
        id: 'visibility',
        meta: { label: 'AI 可讀' },
        enableSorting: false,
        header: 'AI 可讀',
        cell: ({ row }) => {
          const v = row.original.visibility
          return <span className="text-muted-foreground text-xs">{v.includes('*') ? '全部' : v.length ? `${v.length} 個` : '—'}</span>
        },
      },
      {
        accessorKey: 'updated_at',
        meta: { label: '更新時間' },
        header: ({ column }) => <ColumnHeader column={column} title="更新時間" />,
        cell: ({ row }) => (
          <span title={formatDateTime(row.original.updated_at)} className="text-muted-foreground whitespace-nowrap">
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
  const ids = selectedRows.map((r) => r.id)
  const hasFilters = !!(params.q || params.status || params.category || params.source_type || params.source_id || params.tag)

  return (
    <>
      <PageHeader
        title={review ? '待審核記憶' : '記憶'}
        description={
          review
            ? 'AI 或匯入產生、等待確認的記憶；核准後才會被 AI 檢索'
            : '搜尋、整理及控管所有長期記憶'
        }
        actions={
          <>
            {!review && (
              <Button variant="outline" asChild>
                <Link to="/memories/review">待審核</Link>
              </Button>
            )}
            {canEdit && !review && (
              <Button
                onClick={() => {
                  setEditing(null)
                  setFormOpen(true)
                }}
              >
                <Plus /> 新增記憶
              </Button>
            )}
          </>
        }
      />

      {mode !== 'filter' ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <SearchBox value={search} onChange={setSearch} mode={mode} />
            <ModeSelect mode={mode} onChange={(m) => update({ mode: m === 'filter' ? undefined : m })} />
            <FacetedFilter title="分類" options={categoryOptions} value={params.category as string} onChange={(v) => update({ category: v })} />
          </div>
          <SearchResults query={debounced} mode={mode} category={params.category as string} onSelect={(id) => setExtra('selected', id)} />
        </>
      ) : (
        <DataTable
          tableId={review ? 'memories-review' : 'memories'}
          columns={columns}
          data={rows}
          total={query.data?.total ?? 0}
          params={listParams}
          onParamsChange={update}
          getRowId={(r) => r.id}
          isLoading={query.isLoading}
          isFetching={query.isFetching}
          error={query.error}
          onRetry={() => query.refetch()}
          rowSelection={selection}
          onRowSelectionChange={setSelection}
          onRowClick={(r) => setExtra('selected', r.id)}
          empty={
            review ? (
              <EmptyState title="沒有待審核的記憶" description="AI 透過 API 寫入或匯入時選擇「待審核」的記憶會出現在這裡" />
            ) : !hasFilters ? (
              <EmptyState
                title="還沒有任何記憶"
                description="手動新增，或從檔案匯入既有的偏好與專案資訊"
                action={
                  canEdit && (
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" onClick={() => setFormOpen(true)}>
                        <Plus /> 新增記憶
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <Link to="/imports">匯入</Link>
                      </Button>
                    </div>
                  )
                }
              />
            ) : undefined
          }
          toolbar={(table) => (
            <>
              <SearchBox value={search} onChange={setSearch} mode={mode} />
              {!review && <ModeSelect mode={mode} onChange={(m) => update({ mode: m === 'filter' ? undefined : m })} />}
              {!review && (
                <FacetedFilter title="狀態" options={statusOptions} value={params.status as string} onChange={(v) => update({ status: v })} />
              )}
              <FacetedFilter title="分類" options={categoryOptions} value={params.category as string} onChange={(v) => update({ category: v })} />
              {!review && (
                <FacetedFilter
                  title="來源"
                  options={sourceOptions}
                  value={params.source_type as string}
                  onChange={(v) => update({ source_type: v })}
                />
              )}
              {params.tag && (
                <Badge variant="secondary" className="h-8 gap-1">
                  #{params.tag}
                  <button aria-label="清除標籤篩選" onClick={() => update({ tag: undefined })}>
                    <X className="size-3" />
                  </button>
                </Badge>
              )}
              {hasFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearch('')
                    update({ q: undefined, status: undefined, category: undefined, source_type: undefined, source_id: undefined, tag: undefined })
                  }}
                >
                  清除 <X />
                </Button>
              )}
              <div className="ml-auto flex items-center gap-2">
                {canEdit && ids.length > 0 && (
                  <>
                    {review ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ ids, action: 'reject' })}>
                          <X /> 拒絕 {ids.length}
                        </Button>
                        <Button size="sm" onClick={() => setStatus.mutate({ ids, action: 'activate' })}>
                          <Check /> 核准 {ids.length}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ ids, action: 'archive' })}>
                          <Archive /> 封存 {ids.length}
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => setToDelete(selectedRows)}>
                          <Trash2 /> 刪除 {ids.length}
                        </Button>
                      </>
                    )}
                  </>
                )}
                <ViewOptions table={table} />
              </div>
            </>
          )}
        />
      )}

      <MemoryFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        memory={editing}
        defaultVisibility={settings.data?.default_visibility}
        onDuplicate={(id) => {
          setFormOpen(false)
          setExtra('selected', id)
        }}
      />
      <MemoryInspector
        id={selectedId}
        onClose={() => setExtra('selected', null)}
        canEdit={canEdit}
        onEdit={openEdit}
        onDelete={(m) => setToDelete([m])}
      />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`刪除 ${toDelete?.length ?? 0} 筆記憶？`}
        description="記憶、版本歷史與向量索引會一併永久刪除，無法復原。若只是暫時不用，建議改為封存。"
        confirmText="永久刪除"
        destructive
        onConfirm={() => {
          if (!toDelete) return
          del.mutate(
            toDelete.map((m) => m.id),
            {
              onSuccess: () => {
                if (toDelete.some((m) => m.id === selectedId)) setExtra('selected', null)
                setSelection({})
              },
            },
          )
          setToDelete(null)
        }}
      />
    </>
  )
}

function SearchBox({ value, onChange, mode }: { value: string; onChange: (v: string) => void; mode: SearchMode }) {
  const Icon = mode === 'filter' ? Search : Sparkles
  return (
    <div className="relative w-full sm:w-72">
      <Icon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
      <Input
        placeholder={mode === 'filter' ? '搜尋內容或 ID…' : '例如：使用者偏好的回答語言'}
        className="h-8 pl-8"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="搜尋"
      />
    </div>
  )
}

function ModeSelect({ mode, onChange }: { mode: SearchMode; onChange: (m: SearchMode) => void }) {
  return (
    <Select value={mode} onValueChange={(v) => onChange(v as SearchMode)}>
      <SelectTrigger size="sm" className="h-8 w-auto" aria-label="搜尋模式">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SEARCH_MODES.map((m) => (
          <SelectItem key={m.value} value={m.value}>
            {m.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function MemoryReviewPage() {
  return <MemoriesPage review />
}
