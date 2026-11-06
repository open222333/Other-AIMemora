import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'

import { fetchMe } from '@/features/auth/api'
import { useAuth } from '@/features/auth/store'
import { useHotkeys } from '@/hooks/use-hotkeys'

import { CommandMenu } from './command-menu'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'

/** 需登入的頁面外框：側欄 + 頂欄 + 內容 */
export function AppLayout() {
  const token = useAuth((s) => s.token)
  const setUser = useAuth((s) => s.setUser)
  const location = useLocation()
  const [commandOpen, setCommandOpen] = useState(false)
  useHotkeys({ 'mod+k': () => setCommandOpen((o) => !o) })

  // 進入時向後端確認登入狀態並更新使用者資料（401 會由 client 自動登出）
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe, enabled: !!token, staleTime: 5 * 60_000 })
  useEffect(() => {
    if (me.data) setUser(me.data)
  }, [me.data, setUser])

  if (!token) {
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
