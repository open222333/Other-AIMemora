/**
 * 登入狀態：只保存使用者基本資料（名稱、角色），用於畫面顯示。
 * 真正的 session 在後端設定的 httpOnly cookie，JavaScript 無法讀取，XSS 也偷不到；
 * 是否仍登入以 /auth/me 為準（401 會自動清除）。
 */
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import type { Session, User } from '@/api/types'

interface AuthState {
  user: User | null
  setSession: (s: Session) => void
  setUser: (u: User) => void
  clear: () => void
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      setSession: (s) => set({ user: s.user }),
      setUser: (user) => set({ user }),
      clear: () => set({ user: null }),
    }),
    { name: 'memora:auth', storage: createJSONStorage(() => localStorage), version: 1, migrate: () => ({ user: null }) },
  ),
)

export const hasRole = (user: User | null, ...roles: User['role'][]) => !!user && roles.includes(user.role)
