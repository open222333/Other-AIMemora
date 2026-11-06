import type * as React from 'react'
import { PageHeader } from '@/components/common/page-header'
import { useTheme, type Theme } from '@/components/theme-provider'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { env } from '@/config/env'
import { useAuth } from '@/features/auth/store'

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-all">{value}</span>
    </div>
  )
}

export function SettingsPage() {
  const user = useAuth((s) => s.user)
  const { theme, setTheme } = useTheme()
  return (
    <>
      <PageHeader title="設定" description="個人資訊、外觀與連線資訊" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>個人資訊</CardTitle>
            <CardDescription>由後端 /auth/me 提供</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Row label="名稱" value={user?.name} />
            <Row label="帳號" value={user?.username} />
            <Row label="Email" value={user?.email ?? '—'} />
            <Row label="角色" value={<Badge variant="secondary">{user?.role}</Badge>} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>外觀</CardTitle>
            <CardDescription>儲存在此瀏覽器</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Label htmlFor="theme">主題</Label>
            <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
              <SelectTrigger id="theme" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">淺色</SelectItem>
                <SelectItem value="dark">深色</SelectItem>
                <SelectItem value="system">跟隨系統</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>連線資訊</CardTitle>
            <CardDescription>來自 VITE_* 環境變數（建置時決定）</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Row label="API Base URL" value={<code>{env.apiBaseUrl}</code>} />
            <Row label="Mock API" value={env.apiMock ? <Badge variant="warning">啟用</Badge> : <Badge variant="secondary">停用</Badge>} />
            <Row label="逾時" value={`${env.apiTimeoutMs} ms`} />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
