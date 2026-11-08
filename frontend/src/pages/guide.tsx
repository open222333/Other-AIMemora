import { ArrowLeft, LogIn, Monitor, Moon, Sun } from 'lucide-react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { env } from '@/config/env'
import { useThemePreference } from '@/features/auth/preferences'
import { useAuth } from '@/features/auth/store'
import { UserGuide } from '@/features/help/user-guide'

/** 登入後：在主版面內的使用教學（/help） */
export function HelpPage() {
  return <UserGuide />
}

/** 公開：不需登入即可閱讀的使用教學（/guide），從登入頁連結 */
export function PublicGuidePage() {
  const loggedIn = useAuth((s) => !!s.user)
  const { theme, setTheme } = useThemePreference()
  const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor

  return (
    <div className="flex h-full flex-col">
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-30 border-b backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link to={loggedIn ? '/dashboard' : '/login'} className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="size-7" />
            <span className="font-semibold tracking-wide">{env.appName}</span>
            <span className="text-muted-foreground hidden text-sm sm:inline">使用教學</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label="切換主題" onClick={() => setTheme(next)}>
              <ThemeIcon />
            </Button>
            {loggedIn ? (
              <Button size="sm" asChild>
                <Link to="/dashboard">進入 MEMORA</Link>
              </Button>
            ) : (
              <Button size="sm" asChild>
                <Link to="/login">
                  <LogIn /> 登入
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <Link to={loggedIn ? '/dashboard' : '/login'} className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1 text-sm">
            <ArrowLeft className="size-4" /> {loggedIn ? '回到 MEMORA' : '回到登入'}
          </Link>
          <UserGuide />
        </div>
      </main>
    </div>
  )
}
