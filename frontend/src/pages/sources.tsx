import { Link } from 'react-router'

import { PageHeader } from '@/components/common/page-header'
import { EmptyState, ErrorState } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SOURCE_TYPE_LABEL } from '@/features/memories/schema'
import { useSources } from '@/features/system/api'
import { formatDateTime, formatNumber } from '@/lib/format'

const INTEGRATIONS = [
  { name: '手動新增', how: '在「記憶」頁面新增', status: 'available' },
  { name: 'REST API', how: '建立 API Key 後呼叫 /api/v1/memories', status: 'available' },
  { name: 'Markdown / JSON / CSV / TXT', how: '在「匯入」頁面上傳', status: 'available' },
  { name: 'ChatGPT / Claude / Gemini 匯出檔', how: '對話需經 AI 擷取（Extraction Engine）', status: 'phase2' },
  { name: 'MCP', how: 'AI 客戶端透過 MCP Server 讀寫', status: 'phase2' },
]

export function SourcesPage() {
  const q = useSources()
  return (
    <>
      <PageHeader title="記憶來源" description="每筆記憶都可追溯到原始來源；來源被刪除或無法存取時會明確標示" />
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>來源</TableHead>
              <TableHead>類型</TableHead>
              <TableHead>參考</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead className="text-right">記憶數</TableHead>
              <TableHead>建立時間</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <Skeleton className="h-16 w-full" />
                </TableCell>
              </TableRow>
            ) : q.error ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <ErrorState error={q.error} onRetry={() => q.refetch()} />
                </TableCell>
              </TableRow>
            ) : !q.data?.length ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <EmptyState title="還沒有來源" description="新增或匯入記憶後，來源會自動建立" />
                </TableCell>
              </TableRow>
            ) : (
              q.data.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="max-w-[16rem] truncate font-medium">{s.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{SOURCE_TYPE_LABEL[s.type] ?? s.type}</Badge>
                  </TableCell>
                  <TableCell>
                    <code className="text-muted-foreground text-xs">{s.reference ?? '—'}</code>
                  </TableCell>
                  <TableCell>
                    {s.status === 'available' ? <Badge variant="success">可用</Badge> : <Badge variant="destructive">無法存取</Badge>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Link to={`/memories?source_id=${s.id}`} className="hover:underline">
                      {formatNumber(s.memory_count)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDateTime(s.created_at)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>整合方式</CardTitle>
          <CardDescription>不同 AI 平台的歷史對話存取方式不同，MEMORA 依實際支援方式提供 API、匯出檔與 MCP</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {INTEGRATIONS.map((i) => (
              <li key={i.name} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <div className="font-medium">{i.name}</div>
                  <div className="text-muted-foreground text-xs">{i.how}</div>
                </div>
                {i.status === 'available' ? <Badge variant="success">可用</Badge> : <Badge variant="secondary">Phase 2</Badge>}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  )
}
