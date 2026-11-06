import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { NavLink } from 'react-router'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { NAV } from '@/config/nav'
import { env } from '@/config/env'
import { useAuth } from '@/features/auth/store'
import { cn } from '@/lib/utils'

import { useUi } from './ui-store'

export function SidebarNav({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const role = useAuth((s) => s.user?.role)
  return (
    <nav className="flex flex-col gap-4 px-2 py-3">
      {NAV.map((group) => {
        const items = group.items.filter((i) => !i.roles || (role && i.roles.includes(role)))
        if (!items.length) return null
        return (
          <div key={group.label} className="flex flex-col gap-0.5">
            {!collapsed && <div className="text-muted-foreground px-2 pb-1 text-xs font-medium">{group.label}</div>}
            {items.map((item) => {
              const link = (
                <NavLink
                  to={item.url}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'hover:bg-accent hover:text-accent-foreground flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors',
                      isActive ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground',
                      collapsed && 'justify-center px-0',
                    )
                  }
                >
                  <item.icon className="size-4 shrink-0" />
                  {!collapsed && <span className="truncate">{item.title}</span>}
                </NavLink>
              )
              return collapsed ? (
                <Tooltip key={item.url}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.title}</TooltipContent>
                </Tooltip>
              ) : (
                <div key={item.url}>{link}</div>
              )
            })}
          </div>
        )
      })}
    </nav>
  )
}

export function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className={cn('flex h-14 shrink-0 items-center gap-2 px-4', collapsed && 'justify-center px-0')}>
      <div className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md text-sm font-bold">
        {env.appName.slice(0, 1)}
      </div>
      {!collapsed && <span className="truncate font-semibold">{env.appName}</span>}
    </div>
  )
}

/** 桌面版固定側欄（可收合成圖示列） */
export function Sidebar() {
  const collapsed = useUi((s) => s.sidebarCollapsed)
  const toggle = useUi((s) => s.toggleSidebar)
  return (
    <aside
      className={cn(
        'bg-sidebar hidden shrink-0 flex-col border-r transition-[width] duration-200 md:flex',
        collapsed ? 'w-14' : 'w-60',
      )}
    >
      <Brand collapsed={collapsed} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SidebarNav collapsed={collapsed} />
      </div>
      <div className={cn('border-t p-2', collapsed && 'flex justify-center')}>
        <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={collapsed ? '展開側欄' : '收合側欄'}>
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
      </div>
    </aside>
  )
}
