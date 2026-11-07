import { Download, FileUp, Loader2, Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { PageHeader } from '@/components/common/page-header'
import { EmptyState, ErrorState } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { hasRole, useAuth } from '@/features/auth/store'
import { useCancelImport, useCommitImport, useImportJob, useImportJobs, useUploadImport, type ImportJob } from '@/features/imports/api'
import { CATEGORIES, CATEGORY_LABEL, SOURCE_TYPE_LABEL, type Category } from '@/features/memories/schema'
import { downloadFile } from '@/features/system/api'
import { formatDateTime } from '@/lib/format'
import { errorMessage } from '@/lib/query'

const PLATFORMS = ['file', 'chatgpt', 'claude', 'gemini', 'deepseek']
const JOB_STATUS: Record<ImportJob['status'], { label: string; variant: 'success' | 'warning' | 'secondary' | 'destructive' }> = {
  previewed: { label: '待確認', variant: 'warning' },
  running: { label: '匯入中', variant: 'warning' },
  completed: { label: '已完成', variant: 'success' },
  cancelled: { label: '已取消', variant: 'secondary' },
  failed: { label: '解析失敗', variant: 'destructive' },
}

function UploadCard({ onUploaded }: { onUploaded: (id: string) => void }) {
  const upload = useUploadImport()
  const [file, setFile] = useState<File | null>(null)
  const [platform, setPlatform] = useState('file')
  const [category, setCategory] = useState<Category>('knowledge')
  const input = useRef<HTMLInputElement>(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>上傳檔案</CardTitle>
        <CardDescription>
          支援 <code>.md</code>（每個條列項目一筆，標題可指定分類）、<code>.json</code>（MEMORA 匯出檔或陣列）、<code>.csv</code>（content, category, tags）、
          <code>.txt</code>（每行一筆）。上傳後先預覽，確認才寫入。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0])
          }}
          className="hover:border-primary/50 flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-sm transition-colors"
        >
          <FileUp className="text-muted-foreground size-6" />
          {file ? <span className="font-medium">{file.name}</span> : <span className="text-muted-foreground">點擊或拖曳檔案到這裡</span>}
        </button>
        <input
          ref={input}
          type="file"
          accept=".md,.markdown,.json,.csv,.txt"
          className="hidden"
          aria-label="選擇檔案"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="platform">來源平台</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger id="platform" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p === 'file' ? '一般檔案' : SOURCE_TYPE_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="default-category">預設分類</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
              <SelectTrigger id="default-category" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {upload.error && (
          <p role="alert" className="text-destructive text-sm">
            {errorMessage(upload.error)}
          </p>
        )}
        <Button
          disabled={!file || upload.isPending}
          onClick={() =>
            file &&
            upload.mutate(
              { file, platform, defaultCategory: category },
              {
                onSuccess: (job) => {
                  setFile(null)
                  if (input.current) input.current.value = ''
                  onUploaded(job.id)
                },
              },
            )
          }
        >
          {upload.isPending ? <Loader2 className="animate-spin" /> : <Upload />} 解析並預覽
        </Button>
      </CardContent>
    </Card>
  )
}

function Preview({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useImportJob(id)
  if (q.isLoading) return <Skeleton className="h-64 w-full" />
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  return <PreviewBody key={q.data.id} job={q.data} onClose={onClose} />
}

function PreviewBody({ job, onClose }: { job: ImportJob; onClose: () => void }) {
  const commit = useCommitImport()
  const cancel = useCancelImport()
  const [exclude, setExclude] = useState<Set<number>>(() => new Set((job.items ?? []).filter((i) => !i.selected).map((i) => i.index)))
  const [skipDup, setSkipDup] = useState(true)
  const [pending, setPending] = useState(false)
  const items = job.items ?? []
  const toImport = items.filter((i) => !exclude.has(i.index) && !(skipDup && i.duplicate_of)).length
  const editable = job.status === 'previewed'

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="flex items-center gap-2">
            {job.filename} <Badge variant={JOB_STATUS[job.status].variant}>{JOB_STATUS[job.status].label}</Badge>
          </CardTitle>
          <CardDescription>
            {job.format.toUpperCase()} · 解析 {job.total} 筆 · 重複 {items.filter((i) => i.duplicate_of).length} 筆 · 錯誤 {job.errors.length} 筆
            {job.status === 'completed' && ` · 已匯入 ${job.imported} 筆、略過 ${job.skipped} 筆`}
          </CardDescription>
        </div>
        <div className="flex gap-2">
          {job.errors.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadFile(`/imports/${job.id}/errors.csv`, `${job.id}-errors.csv`).catch((e) => toast.error(errorMessage(e)))}
            >
              <Download /> 錯誤報表
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="關閉預覽">
            <X />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {job.errors.length > 0 && (
          <ul className="text-destructive max-h-28 overflow-y-auto rounded-md border p-2 text-xs">
            {job.errors.slice(0, 50).map((e, i) => (
              <li key={i}>
                第 {e.row} 列：{e.message}
              </li>
            ))}
          </ul>
        )}
        {!editable && !items.length && (
          <p className="text-muted-foreground text-xs">任務結束後已清除暫存的原文；匯入的內容只保存在記憶本身，刪除記憶即完整刪除。</p>
        )}
        {items.length > 0 && (
          <div className="max-h-[28rem] overflow-y-auto rounded-md border">
            <Table>
              <TableHeader className="bg-card sticky top-0">
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>內容</TableHead>
                  <TableHead>分類</TableHead>
                  <TableHead>標籤</TableHead>
                  <TableHead>重複</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => (
                  <TableRow key={it.index} className={exclude.has(it.index) ? 'opacity-50' : undefined}>
                    <TableCell>
                      <Checkbox
                        aria-label={`匯入第 ${it.index + 1} 筆`}
                        disabled={!editable}
                        checked={!exclude.has(it.index)}
                        onCheckedChange={(c) =>
                          setExclude((prev) => {
                            const next = new Set(prev)
                            if (c) next.delete(it.index)
                            else next.add(it.index)
                            return next
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="max-w-[28rem] whitespace-normal">{it.content}</TableCell>
                    <TableCell>{CATEGORY_LABEL[it.category as Category]?.split(' ')[0] ?? it.category}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{it.tags.map((t) => `#${t}`).join(' ')}</TableCell>
                    <TableCell>{it.duplicate_of && <Badge variant="warning">{it.duplicate_of.startsWith('#') ? '檔案內重複' : '已存在'}</Badge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {editable && (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-6 text-sm">
              <label className="flex items-center gap-2">
                <Switch checked={skipDup} onCheckedChange={setSkipDup} /> 略過重複
              </label>
              <label className="flex items-center gap-2">
                <Switch checked={pending} onCheckedChange={setPending} /> 匯入為「待審核」
              </label>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate(job.id)}>
                取消匯入
              </Button>
              <Button
                disabled={!toImport || commit.isPending}
                onClick={() =>
                  commit.mutate({ id: job.id, skip_duplicates: skipDup, status: pending ? 'pending' : 'active', exclude: [...exclude] })
                }
              >
                {commit.isPending && <Loader2 className="animate-spin" />}
                匯入 {toImport} 筆
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function ImportsPage() {
  const [sp, setSp] = useSearchParams()
  const jobs = useImportJobs()
  const canEdit = hasRole(useAuth((s) => s.user), 'admin')
  const jobId = sp.get('job')
  const openJob = (id: string | null) =>
    setSp((prev) => {
      const next = new URLSearchParams(prev)
      if (id) next.set('job', id)
      else next.delete('job')
      return next
    })

  return (
    <>
      <PageHeader title="資料匯入" description="把既有的偏好、專案資訊與知識匯入 MEMORA；匯入前預覽、偵測重複，錯誤可下載" />
      {jobId ? <Preview id={jobId} onClose={() => openJob(null)} /> : canEdit && <UploadCard onUploaded={openJob} />}
      <Card>
        <CardHeader>
          <CardTitle>匯入紀錄</CardTitle>
        </CardHeader>
        <CardContent>
          {jobs.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : jobs.error ? (
            <ErrorState error={jobs.error} onRetry={() => jobs.refetch()} />
          ) : !jobs.data?.length ? (
            <EmptyState title="尚無匯入紀錄" />
          ) : (
            <ul className="divide-y text-sm">
              {jobs.data.map((j) => (
                <li key={j.id}>
                  <button className="hover:bg-muted/50 flex w-full flex-wrap items-center gap-3 px-1 py-2.5 text-left" onClick={() => openJob(j.id)}>
                    <span className="min-w-0 flex-1 truncate font-medium">{j.filename}</span>
                    <Badge variant="outline">{j.platform === 'file' ? j.format : SOURCE_TYPE_LABEL[j.platform]}</Badge>
                    <Badge variant={JOB_STATUS[j.status].variant}>{JOB_STATUS[j.status].label}</Badge>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {j.status === 'completed' ? `${j.imported} / ${j.total}` : `${j.total} 筆`}
                    </span>
                    <span className="text-muted-foreground text-xs">{formatDateTime(j.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}
