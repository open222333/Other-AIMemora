/** 側欄導覽設定：新增頁面 → 在 router.tsx 加路由、在這裡加項目 */
import { FolderKanban, LayoutDashboard, Settings, type LucideIcon } from 'lucide-react'

import type { User } from '@/api/types'

export interface NavItem {
  title: string
  url: string
  icon: LucideIcon
  /** 限定角色才顯示（不設 = 全部） */
  roles?: User['role'][]
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV: NavGroup[] = [
  {
    label: 'Workspace',
    items: [
      { title: '總覽', url: '/dashboard', icon: LayoutDashboard },
      { title: '專案', url: '/projects', icon: FolderKanban },
    ],
  },
  {
    label: 'System',
    items: [{ title: '設定', url: '/settings', icon: Settings }],
  },
]
