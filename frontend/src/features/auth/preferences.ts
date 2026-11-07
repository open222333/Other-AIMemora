/** 主題偏好：本機立即套用，並同步到使用者偏好（後端 /auth/me/preferences） */
import { useCallback } from 'react'

import { toUser } from '@/api/adapters'
import { api } from '@/api/client'
import { useTheme, type Theme } from '@/components/theme-provider'

import { useAuth } from './store'

export function useThemePreference() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const loggedIn = useAuth((s) => !!s.user)
  const setUser = useAuth((s) => s.setUser)
  const save = useCallback(
    (t: Theme) => {
      setTheme(t)
      if (!loggedIn) return
      api
        .patch<Record<string, unknown>>('/auth/me/preferences', { theme: t })
        .then((raw) => setUser(toUser(raw)))
        .catch(() => {
          /* 離線時只在本機生效 */
        })
    },
    [setTheme, setUser, loggedIn],
  )
  return { theme, resolvedTheme, setTheme: save }
}
