import { Copy, KeyRound, Loader2, Plus, RotateCw, ShieldOff } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState, ErrorState } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { env } from '@/config/env'
import { AI_SUBJECTS, subjectLabel } from '@/features/memories/schema'
import { useApiKeyAction, useApiKeys, useCreateApiKey, type ApiKey } from '@/features/system/api'
import { formatDateTime, formatRelative } from '@/lib/format'
import { errorMessage } from '@/lib/query'

const SCOPES = [
  { value: 'memories:read', label: '讀取', hint: '列表、檢視、搜尋' },
  { value: 'memories:write', label: '新增 / 修改', hint: '寫入的記憶依設定進入待審核' },
  { value: 'memories:delete', label: '刪除', hint: '高風險，預設不勾選' },
]

const ENDPOINTS = [
  ['POST', '/memories', '新增記憶'],
  ['GET', '/memories', '列表（page、q、category、status、tag）'],
  ['GET', '/memories/{id}', '取得單筆'],
  ['PATCH', '/memories/{id}', '修改（產生新版本）'],
  ['DELETE', '/memories/{id}', '刪除（需 memories:delete）'],
  ['POST', '/memories/search', 'Hybrid 搜尋'],
  ['POST', '/memories/bulk', '批次新增'],
  ['GET', '/sources', '記憶來源（僅限 UI 登入）'],
  ['GET', '/health', '健康狀態（公開）'],
] as const

const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast.success('已複製'))

function CreateKeyDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (key: string) => void }) {
  const create = useCreateApiKey()
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('claude')
  const [scopes, setScopes] = useState<string[]>(['memories:read'])

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) create.reset()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>建立 API Key</DialogTitle>
          <DialogDescription>每把金鑰代表一個 AI；只能讀取「允許讀取的 AI」包含它的記憶。</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate(
              { name: name.trim() || `${subjectLabel(subject)} key`, subject, scopes },
              {
                onSuccess: (k) => {
                  onOpenChange(false)
                  onCreated(k.key)
                  setName('')
                  setScopes(['memories:read'])
                },
              },
            )
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="key-name">名稱</Label>
              <Input id="key-name" placeholder="例如：Claude Desktop" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="key-subject">代表的 AI</Label>
              <Select value={subject} onValueChange={setSubject}>
                <SelectTrigger id="key-subject" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AI_SUBJECTS.filter((s) => s.value !== '*').map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">權限（讀取、寫入、刪除分開授權）</legend>
            {SCOPES.map((s) => (
              <label key={s.value} className="flex items-start gap-2 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={scopes.includes(s.value)}
                  onCheckedChange={(c) => setScopes((prev) => (c ? [...prev, s.value] : prev.filter((x) => x !== s.value)))}
                />
                <span>
                  {s.label} <code className="text-muted-foreground text-xs">{s.value}</code>
                  <span className="text-muted-foreground block text-xs">{s.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {create.error && (
            <p role="alert" className="text-destructive text-sm">
              {errorMessage(create.error)}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={!scopes.length || create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" />} 建立
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function keyState(k: ApiKey) {
  if (k.revoked_at) return <Badge variant="secondary">已撤銷</Badge>
  if (k.expires_at && new Date(k.expires_at) < new Date()) return <Badge variant="secondary">已過期</Badge>
  return <Badge variant="success">有效</Badge>
}

export function DeveloperApiPage() {
  const keys = useApiKeys()
  const action = useApiKeyAction()
  const [createOpen, setCreateOpen] = useState(false)
  const [revealed, setRevealed] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ key: ApiKey; action: 'revoke' | 'rotate' } | null>(null)
  const base = `${window.location.origin}${env.apiBaseUrl}`
  const curl = `curl -X POST ${base}/memories/search \\
  -H "Authorization: Bearer mk_..." \\
  -H "Content-Type: application/json" \\
  -d '{"query": "回答語言偏好", "limit": 5}'`

  return (
    <>
      <PageHeader
        title="REST API"
        description="讓 AI 或自動化流程透過 API Key 在授權範圍內讀寫記憶"
        actions={
          <>
            <Button variant="outline" asChild>
              <a href="/api/docs" target="_blank" rel="noreferrer">
                API 文件
              </a>
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> 建立 API Key
            </Button>
          </>
        }
      />

      {revealed && (
        <Card className="border-primary/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-4" /> 新的 API Key
            </CardTitle>
            <CardDescription>只會顯示這一次，請立即複製並妥善保存。MEMORA 只儲存雜湊值，無法再次查看。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <code className="bg-muted min-w-0 flex-1 rounded px-3 py-2 text-sm break-all">{revealed}</code>
            <Button variant="outline" onClick={() => copy(revealed)}>
              <Copy /> 複製
            </Button>
            <Button variant="ghost" onClick={() => setRevealed(null)}>
              我已保存
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名稱</TableHead>
              <TableHead>AI</TableHead>
              <TableHead>權限</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead>最後使用</TableHead>
              <TableHead>建立時間</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.isLoading ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <Skeleton className="h-12 w-full" />
                </TableCell>
              </TableRow>
            ) : keys.error ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <ErrorState error={keys.error} onRetry={() => keys.refetch()} />
                </TableCell>
              </TableRow>
            ) : !keys.data?.length ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <EmptyState title="尚未建立 API Key" description="建立後即可讓 AI 透過 REST API 存取記憶" />
                </TableCell>
              </TableRow>
            ) : (
              keys.data.map((k) => (
                <TableRow key={k.id} className={k.revoked_at ? 'opacity-60' : undefined}>
                  <TableCell>
                    <div className="font-medium">{k.name}</div>
                    <code className="text-muted-foreground text-xs">{k.prefix}…</code>
                  </TableCell>
                  <TableCell>{k.subject ? subjectLabel(k.subject) : '—'}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {k.scopes.map((s) => (
                        <Badge key={s} variant={s === 'memories:delete' ? 'warning' : 'outline'}>
                          {s.split(':')[1]}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{keyState(k)}</TableCell>
                  <TableCell className="text-muted-foreground">{k.last_used_at ? formatRelative(k.last_used_at) : '從未'}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDateTime(k.created_at)}</TableCell>
                  <TableCell>
                    {!k.revoked_at && (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setConfirm({ key: k, action: 'rotate' })}>
                          <RotateCw /> 輪替
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirm({ key: k, action: 'revoke' })}>
                          <ShieldOff /> 撤銷
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>端點</CardTitle>
            <CardDescription>
              Base URL：<code>{base}</code>；以 <code>Authorization: Bearer &lt;key&gt;</code> 或 <code>X-API-Key</code> 驗證
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {ENDPOINTS.map(([m, path, desc]) => (
                <li key={m + path} className="flex items-center gap-3 py-2">
                  <Badge variant="outline" className="w-16 justify-center font-mono">
                    {m}
                  </Badge>
                  <code className="text-xs">{path}</code>
                  <span className="text-muted-foreground ml-auto text-right text-xs">{desc}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>範例</CardTitle>
            <CardDescription>AI 只會取得「有效」且允許它讀取的記憶；寫入的記憶預設需審核</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">{curl}</pre>
            <Button variant="outline" size="sm" className="self-end" onClick={() => copy(curl)}>
              <Copy /> 複製
            </Button>
          </CardContent>
        </Card>
      </div>

      <CreateKeyDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={setRevealed} />
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.action === 'revoke' ? `撤銷「${confirm.key.name}」？` : `輪替「${confirm?.key.name}」？`}
        description={
          confirm?.action === 'revoke'
            ? '撤銷後使用此金鑰的 AI 會立即失去存取權，無法復原。'
            : '舊金鑰會立即失效，並以相同設定產生新金鑰；請更新使用中的 AI 設定。'
        }
        confirmText={confirm?.action === 'revoke' ? '撤銷' : '輪替'}
        destructive={confirm?.action === 'revoke'}
        onConfirm={() => {
          if (!confirm) return
          action.mutate(
            { id: confirm.key.id, action: confirm.action },
            { onSuccess: (r) => r.key && setRevealed(r.key) },
          )
          setConfirm(null)
        }}
      />
    </>
  )
}
