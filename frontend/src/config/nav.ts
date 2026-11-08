/** 側欄導覽設定：新增頁面 → 在 router.tsx 加路由、在這裡加項目 */
import {
  BookOpen,
  Brain,
  Code2,
  Database,
  FileUp,
  HardDrive,
  LayoutDashboard,
  Network,
  Plug,
  ScrollText,
  Server,
  Settings,
  type LucideIcon,
} from 'lucide-react'

import type { User } from '@/api/types'

export interface NavItem {
  title: string
  url: string
  icon: LucideIcon
  /** 限定角色才顯示（不設 = 全部） */
  roles?: User['role'][]
  /** 尚未實作的模組（顯示階段標籤） */
  soon?: string
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV: NavGroup[] = [
  {
    label: 'Workspace',
    items: [
      { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
      { title: 'Memories', url: '/memories', icon: Brain },
      { title: 'Knowledge Graph', url: '/knowledge', icon: Network, soon: 'P3' },
    ],
  },
  {
    label: 'Data',
    items: [
      { title: 'Sources', url: '/sources', icon: Database },
      { title: 'Imports', url: '/imports', icon: FileUp },
    ],
  },
  {
    label: 'AI Ecosystem',
    items: [{ title: 'Connections', url: '/connections', icon: Plug, soon: 'P2' }],
  },
  {
    label: 'Developer',
    items: [
      { title: 'API', url: '/developer/api', icon: Code2, roles: ['admin'] },
      { title: 'MCP', url: '/developer/mcp', icon: Server, soon: 'P2' },
      { title: 'Logs', url: '/developer/logs', icon: ScrollText },
    ],
  },
  {
    label: 'System',
    items: [
      { title: 'Storage', url: '/storage', icon: HardDrive },
      { title: 'Settings', url: '/settings', icon: Settings },
      { title: '使用教學', url: '/help', icon: BookOpen },
    ],
  },
]
