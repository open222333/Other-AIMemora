import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'

import { useTheme } from '@/components/theme-provider'
import { fetchMe } from '@/features/auth/api'
import { useAuth } from '@/features/auth/store'
import { useHotkeys } from '@/hooks/use-hotkeys'

import { CommandMenu } from './command-menu'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'

/** 需登入的頁面外框：側欄 + 頂欄 + 內容 */
export function AppLayout() {
  const user = useAuth((s) => s.user)
  const setUser = useAuth((s) => s.setUser)
  const location = useLocation()
  const [commandOpen, setCommandOpen] = useState(false)
  useHotkeys({ 'mod+k': () => setCommandOpen((o) => !o) })

  // 進入時向後端確認登入狀態並更新使用者資料（401 會由 client 自動登出）
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe, enabled: !!user, staleTime: 5 * 60_000 })
  const { theme, setTheme } = useTheme()
  useEffect(() => {
    if (!me.data) return
    setUser(me.data)
    // 套用儲存在伺服器的主題偏好（換裝置登入時一致）
    const saved = me.data.preferences?.theme
    if (saved && saved !== theme) setTheme(saved)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.data, setUser])

  if (!user) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />
  }

  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenCommand={() => setCommandOpen(true)} />
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </div>
      <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  )
}
