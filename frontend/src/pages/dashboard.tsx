import {
  BookOpen,
  Brain,
  CheckCircle2,
  CircleAlert,
  Clock,
  Database,
  HardDrive,
  KeyRound,
  MinusCircle,
  Plug,
  Plus,
  Search,
  Upload,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { PageHeader } from '@/components/common/page-header'
import { EmptyState, ErrorState } from '@/components/common/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { env } from '@/config/env'
import { useAuth } from '@/features/auth/store'
import { useActivity, useStats } from '@/features/dashboard/api'
import { GrowthChart } from '@/features/dashboard/growth-chart'
import { CATEGORIES, CATEGORY_LABEL } from '@/features/memories/schema'
import { useHealth } from '@/features/system/api'
import { actionLabel, actorLabel } from '@/features/system/audit-labels'
import { formatBytes, formatNumber, formatRelative } from '@/lib/format'

function StatCard({ label, value, icon: Icon, to, loading, hint }: { label: string; value: ReactNode; icon: LucideIcon; to: string; loading: boolean; hint?: string }) {
  return (
    <Link to={to} className="group">
      <Card className="group-hover:border-primary/40 h-full gap-2 transition-colors">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardDescription>{label}</CardDescription>
          <Icon className="text-muted-foreground size-4" />
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-8 w-16" /> : <div className="text-3xl font-semibold tabular-nums">{value}</div>}
          {hint && <div className="text-muted-foreground mt-1 text-xs">{hint}</div>}
        </CardContent>
      </Card>
    </Link>
  )
}

function HealthRow({ label, ok, value }: { label: string; ok: boolean | null; value: string }) {
  const Icon = ok === null ? MinusCircle : ok ? CheckCircle2 : CircleAlert
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5">
        <Icon className={ok === null ? 'text-muted-foreground size-4' : ok ? 'size-4 text-emerald-600 dark:text-emerald-400' : 'text-destructive size-4'} />
        {value}
      </span>
    </div>
  )
}

export function DashboardPage() {
  const user = useAuth((s) => s.user)
  const stats = useStats()
  const activity = useActivity()
  const health = useHealth()
  const s = stats.data
  const loading = stats.isLoading
  const maxCategory = Math.max(1, ...Object.values(s?.by_category ?? {}))

  return (
    <>
      <PageHeader
        title="總覽"
        description={`歡迎回來，${user?.name ?? ''}。這裡的數字都來自你的資料庫。`}
        actions={
          <Button asChild>
            <Link to="/memories?new=1">
              <Plus /> 新增記憶
            </Link>
          </Button>
        }
      />
      {env.apiMock && (
        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          Demo Data：目前使用前端 mock API（VITE_API_MOCK=true），畫面上的資料皆為示範用，並非線上狀態。
        </p>
      )}

      {stats.error ? (
        <Card>
          <ErrorState error={stats.error} onRetry={() => stats.refetch()} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Total Memories" value={formatNumber(s?.total ?? 0)} icon={Brain} to="/memories" loading={loading} />
          <StatCard label="Active Memories" value={formatNumber(s?.active ?? 0)} icon={CheckCircle2} to="/memories?status=active" loading={loading} />
          <StatCard
            label="Pending Review"
            value={formatNumber(s?.pending ?? 0)}
            icon={Clock}
            to="/memories/review"
            loading={loading}
            hint={s?.pending ? '等待你確認' : undefined}
          />
          <StatCard
            label="AI Access"
            value={formatNumber(s?.api_keys ?? 0)}
            icon={KeyRound}
            to="/developer/api"
            loading={loading}
            hint="有效的 API Key"
          />
          <StatCard label="Storage Usage" value={formatBytes(s?.storage_bytes)} icon={HardDrive} to="/storage" loading={loading} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Memory Growth</CardTitle>
            <CardDescription>近 30 天記憶總數</CardDescription>
          </CardHeader>
          <CardContent>{loading ? <Skeleton className="h-48 w-full" /> : s && <GrowthChart data={s.growth} />}</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>快速操作</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-2">
            {(
              [
                ['/memories?new=1', Plus, 'Add Memory'],
                ['/imports', Upload, 'Import Conversations'],
                ['/developer/api', Plug, 'Connect AI'],
                ['/memories?mode=hybrid', Search, 'Search Memories'],
              ] as const
            ).map(([to, Icon, label]) => (
              <Button key={to} variant="outline" className="justify-start" asChild>
                <Link to={to}>
                  <Icon /> {label}
                </Link>
              </Button>
            ))}
            <Button variant="outline" className="justify-start" asChild>
              <a href="/api/docs" target="_blank" rel="noreferrer">
                <BookOpen /> Open API Docs
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>來自操作紀錄（不含記憶內容）</CardDescription>
          </CardHeader>
          <CardContent>
            {activity.isLoading ? (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            ) : activity.error ? (
              <ErrorState error={activity.error} onRetry={() => activity.refetch()} />
            ) : !activity.data?.length ? (
              <EmptyState title="尚無活動" />
            ) : (
              <ul className="divide-y">
                {activity.data.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{actorLabel(a.actor_type, a.actor_name)}</span> {actionLabel(a.action)}
                      {a.target_id && <code className="text-muted-foreground ml-1 text-xs">{a.target_id}</code>}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs">{formatRelative(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 text-right">
              <Link to="/developer/logs" className="text-muted-foreground hover:text-foreground text-xs">
                查看全部紀錄 →
              </Link>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                API Health
                {health.data && <Badge variant={health.data.status === 'ok' ? 'success' : 'warning'}>{health.data.status}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {health.error ? (
                <HealthRow label="API" ok={false} value="無法連線" />
              ) : (
                <>
                  <HealthRow label="API" ok={health.data ? true : null} value={health.data ? `v${health.data.version}` : '檢查中'} />
                  <HealthRow label="PostgreSQL" ok={health.data ? health.data.database === 'ok' : null} value={health.data?.database ?? '—'} />
                  <HealthRow label="pgvector" ok={health.data ? health.data.pgvector === 'ok' : null} value={health.data?.pgvector ?? '—'} />
                  <HealthRow
                    label="Embedding"
                    ok={health.data && health.data.embedding !== 'disabled' ? true : null}
                    value={health.data?.embedding === 'disabled' ? '未啟用（僅關鍵字）' : (health.data?.embedding ?? '—')}
                  />
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Connection Health</CardTitle>
              <CardDescription>AI 連線狀態與記憶同步狀態分開呈現</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              {s?.ai_connections ? (
                <span>{s.ai_connections} 個連線</span>
              ) : (
                <div className="text-muted-foreground flex flex-col gap-2">
                  <span>尚未設定 AI 連線（MCP / 原生整合規劃於 Phase 2）。</span>
                  <span>
                    目前可用 <Link to="/developer/api" className="text-foreground underline">API Key</Link> 讓 AI 透過 REST API 讀寫記憶。
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>分類分布</CardTitle>
          <CardDescription>各分類的記憶數量</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <ul className="flex flex-col gap-2">
              {CATEGORIES.map((c) => {
                const n = s?.by_category[c] ?? 0
                return (
                  <li key={c}>
                    <Link to={`/memories?category=${c}`} className="group grid grid-cols-[9rem_1fr_3rem] items-center gap-3 text-sm">
                      <span className="text-muted-foreground group-hover:text-foreground truncate">{CATEGORY_LABEL[c]}</span>
                      <span className="h-3">
                        <span
                          className="bg-chart-1 block h-full rounded-r-[4px]"
                          style={{ width: `${(n / maxCategory) * 100}%`, minWidth: n ? 4 : 0 }}
                        />
                      </span>
                      <span className="text-right tabular-nums">{formatNumber(n)}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Database className="size-3.5" /> {formatNumber(s?.sources ?? 0)} 個記憶來源
      </div>
    </>
  )
}
