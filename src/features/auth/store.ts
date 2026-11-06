/**
 * 登入狀態（token 存 localStorage）。
 * 安全性較高的做法是後端改用 httpOnly cookie：此時移除 token 欄位、client 改用 credentials: 'include'。
 */
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import type { Session, User } from '@/api/types'

interface AuthState {
  token: string | null
  user: User | null
  setSession: (s: Session) => void
  setUser: (u: User) => void
  clear: () => void
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: (s) => set({ token: s.token, user: s.user }),
      setUser: (user) => set({ user }),
      clear: () => set({ token: null, user: null }),
    }),
    { name: 'dashboard:auth', storage: createJSONStorage(() => localStorage) },
  ),
)

export const hasRole = (user: User | null, ...roles: User['role'][]) => !!user && roles.includes(user.role)
