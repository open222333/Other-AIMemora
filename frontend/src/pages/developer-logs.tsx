import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'

import { PageHeader } from '@/components/common/page-header'
import { DataTable } from '@/components/data-table/data-table'
import { FacetedFilter } from '@/components/data-table/faceted-filter'
import { Badge } from '@/components/ui/badge'
import { useAuditLogs, type AuditEntry } from '@/features/system/api'
import { actionLabel } from '@/features/system/audit-labels'
import { useListParams } from '@/hooks/use-list-params'
import { formatDateTime } from '@/lib/format'

const actorOptions = [
  { value: 'user', label: '使用者' },
  { value: 'api_key', label: 'API Key（AI）' },
]
const resultOptions = [
  { value: 'success', label: '成功' },
  { value: 'denied', label: '拒絕' },
  { value: 'error', label: '錯誤' },
]

export function DeveloperLogsPage() {
  const { params, update } = useListParams({ pageSize: 20, filters: ['actor_type', 'result'] })
  const q = useAuditLogs(params)
  const columns = useMemo<ColumnDef<AuditEntry>[]>(
    () => [
      {
        accessorKey: 'created_at',
        header: '時間',
        enableSorting: false,
        cell: ({ row }) => <span className="text-muted-foreground whitespace-nowrap">{formatDateTime(row.original.created_at)}</span>,
      },
      {
        id: 'actor',
        header: '呼叫者',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Badge variant={row.original.actor_type === 'api_key' ? 'default' : 'outline'}>
              {row.original.actor_type === 'api_key' ? 'API' : 'User'}
            </Badge>
            <span className="truncate">{row.original.actor_name}</span>
          </div>
        ),
      },
      {
        accessorKey: 'action',
        header: '動作',
        enableSorting: false,
        cell: ({ row }) => (
          <div>
            <div>{actionLabel(row.original.action)}</div>
            <code className="text-muted-foreground text-xs">{row.original.action}</code>
          </div>
        ),
      },
      {
        id: 'target',
        header: '目標',
        cell: ({ row }) => <code className="text-xs">{row.original.target_id ?? '—'}</code>,
      },
      {
        accessorKey: 'result',
        header: '結果',
        enableSorting: false,
        cell: ({ row }) => (
          <Badge variant={row.original.result === 'success' ? 'success' : 'destructive'}>{row.original.result}</Badge>
        ),
      },
      {
        id: 'detail',
        header: '細節',
        cell: ({ row }) => (
          <code className="text-muted-foreground line-clamp-1 max-w-[16rem] text-xs">
            {Object.keys(row.original.detail).length ? JSON.stringify(row.original.detail) : ''}
          </code>
        ),
      },
    ],
    [],
  )
  return (
    <>
      <PageHeader title="操作紀錄" description="誰在何時讀取、寫入或刪除了什麼；只記錄 ID 與 metadata，不記錄完整記憶內容" />
      <DataTable
        tableId="audit"
        columns={columns}
        data={q.data?.items}
        total={q.data?.total ?? 0}
        params={params}
        onParamsChange={update}
        getRowId={(r) => String(r.id)}
        isLoading={q.isLoading}
        isFetching={q.isFetching}
        error={q.error}
        onRetry={() => q.refetch()}
        toolbar={() => (
          <>
            <FacetedFilter title="呼叫者" options={actorOptions} value={params.actor_type as string} onChange={(v) => update({ actor_type: v })} />
            <FacetedFilter title="結果" options={resultOptions} value={params.result as string} onChange={(v) => update({ result: v })} />
          </>
        )}
      />
    </>
  )
}
