import { LogOut, Monitor, Moon, Sun } from 'lucide-react'
import { useNavigate } from 'react-router'

import { useTheme } from '@/components/theme-provider'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { NAV } from '@/config/nav'
import { useAuth } from '@/features/auth/store'

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate()
  const { setTheme } = useTheme()
  const role = useAuth((s) => s.user?.role)
  const clear = useAuth((s) => s.clear)
  const run = (fn: () => void) => () => {
    onOpenChange(false)
    fn()
  }
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="指令" description="前往頁面或執行指令">
      <CommandInput placeholder="輸入頁面或指令…" />
      <CommandList>
        <CommandEmpty>找不到符合的項目</CommandEmpty>
        {NAV.map((g) => (
          <CommandGroup key={g.label} heading={g.label}>
            {g.items
              .filter((i) => !i.roles || (role && i.roles.includes(role)))
              .map((i) => (
                <CommandItem key={i.url} value={`${i.title} ${i.url}`} onSelect={run(() => navigate(i.url))}>
                  <i.icon /> {i.title}
                </CommandItem>
              ))}
          </CommandGroup>
        ))}
        <CommandGroup heading="主題">
          <CommandItem onSelect={run(() => setTheme('light'))}>
            <Sun /> 淺色
          </CommandItem>
          <CommandItem onSelect={run(() => setTheme('dark'))}>
            <Moon /> 深色
          </CommandItem>
          <CommandItem onSelect={run(() => setTheme('system'))}>
            <Monitor /> 跟隨系統
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="帳號">
          <CommandItem
            onSelect={run(() => {
              clear()
              navigate('/login', { replace: true })
            })}
          >
            <LogOut /> 登出
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
