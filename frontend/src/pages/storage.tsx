import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, CircleAlert, Download, Loader2, RefreshCw } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'

import { api } from '@/api/client'
import { PageHeader } from '@/components/common/page-header'
import { ErrorState } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { hasRole, useAuth } from '@/features/auth/store'
import { downloadFile, useStorage } from '@/features/system/api'
import { formatBytes, formatNumber } from '@/lib/format'
import { errorMessage } from '@/lib/query'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-all">{children}</span>
    </div>
  )
}

const Ok = ({ ok, children }: { ok: boolean; children: ReactNode }) => (
  <span className="flex items-center gap-1.5">
    {ok ? (
      <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
    ) : (
      <CircleAlert className="text-destructive size-4" />
    )}
    {children}
  </span>
)

export function StoragePage() {
  const q = useStorage()
  const qc = useQueryClient()
  const isAdmin = hasRole(useAuth((s) => s.user), 'admin')
  const [exporting, setExporting] = useState<string | null>(null)
  const reindex = useMutation({
    mutationFn: () => api.post<{ embedded: number; failed: number }>('/storage/reindex'),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['storage'] })
      toast.success(`已建立 ${r.embedded} 筆向量${r.failed ? `，${r.failed} 筆失敗` : ''}`)
    },
  })
  const doExport = (format: 'json' | 'csv') => {
    setExporting(format)
    downloadFile('/export', `memora-export.${format}`, { format })
      .catch((e) => toast.error(errorMessage(e)))
      .finally(() => setExporting(null))
  }

  if (q.isLoading) return <Skeleton className="h-96 w-full" />
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const s = q.data
  const emb = s.embedding

  return (
    <>
      <PageHeader title="儲存管理" description="資料庫、向量索引與備份狀態；連線密碼等敏感資訊不會顯示" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>資料庫</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Row label="PostgreSQL">
              <Ok ok={!!s.database.postgres}>{s.database.postgres ?? '無法連線'}</Ok>
            </Row>
            <Row label="pgvector">
              <Ok ok={!!s.database.pgvector}>{s.database.pgvector ?? '未安裝'}</Ok>
            </Row>
            <Row label="pg_trgm（關鍵字）">
              <Ok ok={!!s.database.pg_trgm}>{s.database.pg_trgm ?? '未安裝'}</Ok>
            </Row>
            <Row label="磁碟使用量">{formatBytes(s.database.size_bytes)}</Row>
            <Row label="記憶數量">{formatNumber(s.memories)}</Row>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div className="flex flex-col gap-1.5">
              <CardTitle>Embedding / 向量索引</CardTitle>
              <CardDescription>語意搜尋所需；預設不啟用，資料不會傳送到外部服務</CardDescription>
            </div>
            {isAdmin && emb.provider !== 'disabled' && (
              <Button size="sm" variant="outline" disabled={reindex.isPending} onClick={() => reindex.mutate()}>
                {reindex.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} 補建向量
              </Button>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Row label="Provider">
              {emb.provider === 'disabled' ? <Badge variant="secondary">未啟用（僅關鍵字搜尋）</Badge> : <Badge>{emb.provider}</Badge>}
            </Row>
            {emb.provider !== 'disabled' && (
              <>
                <Row label="模型">
                  <code>{emb.model}</code>
                </Row>
                <Row label="Endpoint">
                  <code className="text-xs">{emb.base_url}</code>
                </Row>
                <Row label="已建立向量">
                  {formatNumber(emb.embedded)} / {formatNumber(s.memories)}
                  {!!emb.missing && <span className="text-amber-700 dark:text-amber-400">（缺 {emb.missing}）</span>}
                </Row>
              </>
            )}
            <Row label="向量索引">{s.index.vector}</Row>
            <Row label="關鍵字索引">{s.index.keyword}</Row>
            {emb.models.length > 0 && (
              <Row label="已儲存模型">
                {emb.models.map((m) => (
                  <div key={m.model} className="text-xs">
                    {m.model}（{m.dim} 維）· {m.count} 筆
                  </div>
                ))}
              </Row>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>匯出與備份</CardTitle>
          <CardDescription>{s.backup.note}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!!exporting} onClick={() => doExport('json')}>
              {exporting === 'json' ? <Loader2 className="animate-spin" /> : <Download />} 匯出 JSON（含版本歷史）
            </Button>
            <Button variant="outline" disabled={!!exporting} onClick={() => doExport('csv')}>
              {exporting === 'csv' ? <Loader2 className="animate-spin" /> : <Download />} 匯出 CSV
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            JSON 匯出檔可在「匯入」頁面匯回。完整資料庫備份：<code>docker compose exec db pg_dump -U memora memora &gt; backup.sql</code>
          </p>
        </CardContent>
      </Card>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>資料表</TableHead>
              <TableHead className="text-right">列數（估計）</TableHead>
              <TableHead className="text-right">大小</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {s.tables.map((t) => (
              <TableRow key={t.name}>
                <TableCell>
                  <code>{t.name}</code>
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(t.rows)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatBytes(t.bytes)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  )
}
