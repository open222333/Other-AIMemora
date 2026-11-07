import { Archive, Check, History, Info, Pencil, Trash2, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { ErrorState } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'

import { useMemory, useMemoryVersions, useSetStatus } from './api'
import { CategoryBadge, SourceLabel, StatusBadge, VisibilityList } from './badges'
import { CATEGORY_LABEL, SOURCE_TYPE_LABEL, type Memory } from './schema'

interface Props {
  id: string | null
  onClose: () => void
  canEdit: boolean
  onEdit: (m: Memory) => void
  onDelete: (m: Memory) => void
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-start gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="min-w-0 break-words">{children}</div>
    </div>
  )
}

const dash = <span className="text-muted-foreground">—</span>

/** AI 修改提案：並列顯示原記憶與提案內容 */
function ProposalCompare({ m }: { m: Memory }) {
  const original = useMemory(m.proposal_for ?? null)
  const o = original.data
  const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b)
  return (
    <div className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
      <div className="font-medium">AI 修改提案</div>
      <p className="text-muted-foreground text-xs">
        由 <code>{m.created_by}</code> 提出，核准後才會套用到原記憶 <code>{m.proposal_for}</code>（原記憶會產生新版本）。
      </p>
      {original.isLoading ? (
        <Skeleton className="h-12 w-full" />
      ) : !o ? (
        <p className="text-destructive text-xs">找不到原記憶</p>
      ) : (
        <div className="grid gap-2">
          <div>
            <div className="text-muted-foreground text-xs">原內容</div>
            <p className="whitespace-pre-wrap line-through decoration-1 opacity-70">{o.content}</p>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">提案內容</div>
            <p className="whitespace-pre-wrap">{m.content}</p>
          </div>
          {(changed(o.category, m.category) || changed(o.tags, m.tags) || changed(o.confidence, m.confidence)) && (
            <ul className="text-muted-foreground text-xs">
              {changed(o.category, m.category) && <li>分類：{CATEGORY_LABEL[o.category]} → {CATEGORY_LABEL[m.category]}</li>}
              {changed(o.tags, m.tags) && (
                <li>
                  標籤：{o.tags.join(', ') || '—'} → {m.tags.join(', ') || '—'}
                </li>
              )}
              {changed(o.confidence, m.confidence) && (
                <li>
                  可信度：{Math.round(o.confidence * 100)}% → {Math.round(m.confidence * 100)}%
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function Details({ m }: { m: Memory }) {
  return (
    <>
      {m.proposal_for ? (
        <ProposalCompare m={m} />
      ) : (
        <p className="bg-muted/50 rounded-md border p-3 text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
      )}
      <Row label="狀態">
        <StatusBadge status={m.status} />
      </Row>
      <Row label="分類">
        <CategoryBadge category={m.category} />
      </Row>
      <Row label="標籤">
        {m.tags.length ? (
          <div className="flex flex-wrap gap-1">
            {m.tags.map((t) => (
              <Badge key={t} variant="secondary">
                #{t}
              </Badge>
            ))}
          </div>
        ) : (
          dash
        )}
      </Row>
      <Row label="可信度">{Math.round(m.confidence * 100)}%</Row>
      <Row label="允許讀取">
        <VisibilityList visibility={m.visibility} />
      </Row>
      <Separator />
      <Row label="來源">
        <div className="flex flex-col">
          <SourceLabel source={m.source} />
          {m.source && m.source.name !== SOURCE_TYPE_LABEL[m.source.type] && (
            <span className="text-muted-foreground truncate text-xs">{m.source.name}</span>
          )}
        </div>
      </Row>
      <Row label="建立者">
        <code className="text-xs">{m.created_by}</code>
      </Row>
      <Row label="建立時間">{formatDateTime(m.created_at)}</Row>
      <Row label="更新時間">{formatDateTime(m.updated_at)}</Row>
      <Row label="AI 最後讀取">{m.last_accessed_at ? formatRelative(m.last_accessed_at) : '尚未被 AI 讀取'}</Row>
      <Row label="到期日">{m.expires_at ? formatDateTime(m.expires_at) : dash}</Row>
    </>
  )
}

function Versions({ id }: { id: string }) {
  const q = useMemoryVersions(id)
  if (q.isLoading) return <Skeleton className="h-24 w-full" />
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  return (
    <ol className="relative flex flex-col gap-4 border-l pl-4">
      {q.data?.map((v) => (
        <li key={v.id} className="relative">
          <span className="bg-primary absolute top-1.5 -left-[1.3rem] size-2 rounded-full" />
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">v{v.version}</span>
            <span className="text-muted-foreground text-xs">{formatDateTime(v.created_at)}</span>
          </div>
          <div className="text-muted-foreground text-xs">
            {v.changed_by}
            {v.change_reason && ` · ${v.change_reason}`}
          </div>
          <p className="mt-1 text-sm whitespace-pre-wrap">{v.content}</p>
          <div className="text-muted-foreground mt-1 text-xs">
            {CATEGORY_LABEL[v.category]} · {v.status}
            {v.tags.length > 0 && ` · ${v.tags.map((t) => `#${t}`).join(' ')}`}
          </div>
        </li>
      ))}
    </ol>
  )
}

/** 右側 Inspector：記憶詳細資訊、版本歷史、審核操作（網址 ?selected=<id>） */
export function MemoryInspector({ id, onClose, canEdit, onEdit, onDelete }: Props) {
  const q = useMemory(id)
  const setStatus = useSetStatus()
  const [tab, setTab] = useState<'details' | 'versions'>('details')
  const m = q.data

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && (onClose(), setTab('details'))}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>記憶詳細資訊</SheetTitle>
          <SheetDescription>
            {id}
            {m && ` · v${m.version} · ${SOURCE_TYPE_LABEL[m.source?.type ?? ''] ?? '來源已刪除'}`}
          </SheetDescription>
        </SheetHeader>
        <div className="flex gap-1 px-4" role="tablist">
          {(
            [
              ['details', '資訊', Info],
              ['versions', '版本歷史', History],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm',
                tab === key ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
          {q.isLoading ? (
            Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-5 w-full" />)
          ) : q.error ? (
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          ) : m ? (
            tab === 'details' ? (
              <Details m={m} />
            ) : (
              <Versions id={m.id} />
            )
          ) : null}
        </div>
        {m && canEdit && (
          <SheetFooter className="flex-row flex-wrap justify-end border-t">
            {m.status === 'pending' ? (
              <>
                <Button variant="outline" onClick={() => setStatus.mutate({ ids: [m.id], action: 'reject' })}>
                  <X /> 拒絕
                </Button>
                <Button
                  onClick={() => {
                    // 核准提案後提案本身會被移除（內容併入原記憶），因此先關閉面板
                    if (m.proposal_for) onClose()
                    setStatus.mutate({ ids: [m.id], action: 'activate' })
                  }}
                >
                  <Check /> {m.proposal_for ? '核准並套用' : '核准'}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => onDelete(m)}>
                  <Trash2 /> 刪除
                </Button>
                {m.status === 'active' && (
                  <Button variant="outline" onClick={() => setStatus.mutate({ ids: [m.id], action: 'archive' })}>
                    <Archive /> 封存
                  </Button>
                )}
                <Button onClick={() => onEdit(m)}>
                  <Pencil /> 編輯
                </Button>
              </>
            )}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
