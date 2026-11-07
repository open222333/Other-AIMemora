import { useMutation } from '@tanstack/react-query'
import { Loader2, LogOut } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { ApiError } from '@/api/client'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { PageHeader } from '@/components/common/page-header'
import { ErrorState } from '@/components/common/states'
import type { Theme } from '@/components/theme-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { env } from '@/config/env'
import { changePassword, logoutAll } from '@/features/auth/api'
import { useThemePreference } from '@/features/auth/preferences'
import { hasRole, useAuth } from '@/features/auth/store'
import { AI_SUBJECTS } from '@/features/memories/schema'
import { useSaveSettings, useWorkspaceSettings, type WorkspaceSettings } from '@/features/system/api'
import { errorMessage } from '@/lib/query'

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-all">{value}</span>
    </div>
  )
}

const ROADMAP = [
  ['Memory Rules', '記憶提取及更新規則（Phase 2）'],
  ['Security', 'Session 有效期限、Secret 加密（目前由環境變數設定）'],
  ['Backup', '自動備份及還原（Phase 4）'],
  ['Notifications', '系統通知（Phase 4）'],
  ['Advanced', 'Embedding、模型、快取（目前由 .env 設定）'],
]

function WorkspaceForm({ initial, canEdit }: { initial: WorkspaceSettings; canEdit: boolean }) {
  const save = useSaveSettings()
  const [v, setV] = useState(initial)
  const dirty = JSON.stringify(v) !== JSON.stringify(initial)
  const vis = v.default_visibility

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate(v)
      }}
    >
      <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="ws-name">系統名稱</Label>
          <Input id="ws-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ws-lang">語言</Label>
          <Select value={v.language} onValueChange={(language) => setV({ ...v, language })}>
            <SelectTrigger id="ws-lang" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="zh-TW">繁體中文</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ws-tz">時區</Label>
          <Input id="ws-tz" value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })} />
        </div>
      </fieldset>

      <fieldset disabled={!canEdit} className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">新記憶預設「允許讀取的 AI」</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {AI_SUBJECTS.map((s) => {
            const locked = s.value !== '*' && vis.includes('*')
            return (
              <label key={s.value} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={vis.includes(s.value) || locked}
                  disabled={locked || !canEdit}
                  onCheckedChange={(c) =>
                    setV({
                      ...v,
                      default_visibility: c ? (s.value === '*' ? ['*'] : [...vis, s.value]) : vis.filter((x) => x !== s.value),
                    })
                  }
                />
                {s.label}
              </label>
            )
          })}
        </div>
        <p className="text-muted-foreground text-xs">建議維持最小權限：只勾選真正需要的 AI。每筆記憶仍可個別調整。</p>
      </fieldset>

      <label className="flex items-start gap-3 text-sm">
        <Switch
          checked={v.require_review_for_api}
          disabled={!canEdit}
          onCheckedChange={(require_review_for_api) => setV({ ...v, require_review_for_api })}
        />
        <span>
          AI 透過 API 寫入的記憶需要審核
          <span className="text-muted-foreground block text-xs">開啟時，AI 新增的記憶會進入「待審核」，核准後才會被檢索。</span>
        </span>
      </label>

      {canEdit && (
        <div className="flex justify-end">
          <Button type="submit" disabled={!dirty || save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" />} 儲存設定
          </Button>
        </div>
      )}
    </form>
  )
}

const MAX_PASSWORD_BYTES = 72

function SecurityCard() {
  const navigate = useNavigate()
  const clear = useAuth((s) => s.clear)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [confirmLogoutAll, setConfirmLogoutAll] = useState(false)
  const bytes = new TextEncoder().encode(next).length
  const localError =
    next && next.length < 8
      ? '至少 8 個字元'
      : bytes > MAX_PASSWORD_BYTES
        ? `最多 ${MAX_PASSWORD_BYTES} bytes（中文約 24 字）`
        : confirm && confirm !== next
          ? '兩次輸入的新密碼不一致'
          : null
  const change = useMutation({
    meta: { silent: true },
    mutationFn: () => changePassword(current, next),
    onSuccess: () => {
      setCurrent('')
      setNext('')
      setConfirm('')
      toast.success('密碼已更新，其他裝置已登出')
    },
  })
  const all = useMutation({
    mutationFn: logoutAll,
    onSuccess: () => {
      clear()
      navigate('/login', { replace: true })
    },
  })
  const serverError = change.error instanceof ApiError && change.error.status === 422 ? '新密碼格式不符' : change.error && errorMessage(change.error)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Security</CardTitle>
        <CardDescription>登入 session 存在 httpOnly cookie（網頁程式讀不到）；改密碼或登出所有裝置會讓既有 session 立即失效</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[1fr_auto]">
        <form
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!localError && current && next && confirm) change.mutate()
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="pw-current">目前密碼</Label>
            <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pw-new">新密碼</Label>
            <Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pw-confirm">確認新密碼</Label>
            <Input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <div className="flex items-center justify-between gap-2 sm:col-span-3">
            <p role={localError || serverError ? 'alert' : undefined} className="text-destructive text-sm">
              {localError ?? serverError}
            </p>
            <Button type="submit" disabled={!current || !next || !confirm || !!localError || change.isPending}>
              {change.isPending && <Loader2 className="animate-spin" />} 變更密碼
            </Button>
          </div>
        </form>
        <div className="flex flex-col gap-2 lg:border-l lg:pl-6">
          <span className="text-sm font-medium">登出所有裝置</span>
          <span className="text-muted-foreground max-w-56 text-xs">懷疑帳號外洩，或在公用電腦登入過時使用。包含目前這個瀏覽器。</span>
          <Button variant="outline" className="self-start" onClick={() => setConfirmLogoutAll(true)}>
            <LogOut /> 登出所有裝置
          </Button>
        </div>
      </CardContent>
      <ConfirmDialog
        open={confirmLogoutAll}
        onOpenChange={setConfirmLogoutAll}
        title="登出所有裝置？"
        description="所有瀏覽器的登入都會立即失效（包含這一個），需要重新登入。API Key 不受影響。"
        confirmText="全部登出"
        destructive
        onConfirm={() => all.mutate()}
      />
    </Card>
  )
}

export function SettingsPage() {
  const user = useAuth((s) => s.user)
  const { theme, setTheme } = useThemePreference()
  const settings = useWorkspaceSettings()
  const canEdit = hasRole(user, 'admin')

  return (
    <>
      <PageHeader title="設定" description="一般、外觀、隱私與記憶規則" />
      <Card>
        <CardHeader>
          <CardTitle>一般與隱私</CardTitle>
          <CardDescription>工作空間設定（儲存在伺服器）</CardDescription>
        </CardHeader>
        <CardContent>
          {settings.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : settings.error || !settings.data ? (
            <ErrorState error={settings.error} onRetry={() => settings.refetch()} />
          ) : (
            <WorkspaceForm key={JSON.stringify(settings.data)} initial={settings.data} canEdit={canEdit} />
          )}
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>儲存在你的使用者偏好，換裝置登入也會套用</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Label htmlFor="theme">主題</Label>
            <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
              <SelectTrigger id="theme" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light 淺色</SelectItem>
                <SelectItem value="dark">Dark 深色</SelectItem>
                <SelectItem value="system">System 跟隨系統</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>帳號</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Row label="名稱" value={user?.name} />
            <Row label="帳號" value={user?.username} />
            <Row label="角色" value={<Badge variant="secondary">{user?.role}</Badge>} />
            <Row label="API Base URL" value={<code>{env.apiBaseUrl}</code>} />
            {env.apiMock && <Row label="Mock API" value={<Badge variant="warning">啟用（Demo Data）</Badge>} />}
          </CardContent>
        </Card>
      </div>
      <SecurityCard />
      <Card>
        <CardHeader>
          <CardTitle>其他設定</CardTitle>
          <CardDescription>依開發階段陸續開放</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {ROADMAP.map(([k, d]) => (
              <li key={k} className="flex justify-between gap-4 py-2">
                <span className="font-medium">{k}</span>
                <span className="text-muted-foreground text-right">{d}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  )
}
