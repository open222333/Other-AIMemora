import { api } from '@/api/client'
import { toSession, toUser } from '@/api/adapters'
import type { Session, User } from '@/api/types'

export async function login(username: string, password: string): Promise<Session> {
  const raw = await api.post<Record<string, unknown>>('/auth/login', { username, password })
  return toSession(raw, username)
}

export async function fetchMe(): Promise<User> {
  return toUser(await api.get<Record<string, unknown>>('/auth/me'))
}

/** 登出此瀏覽器（後端清除 cookie） */
export async function logout(): Promise<void> {
  await api.post('/auth/logout').catch(() => {
    /* 離線也要清除本機狀態 */
  })
}

/** 登出所有裝置（所有 session 立即失效） */
export const logoutAll = () => api.post<void>('/auth/logout-all')

export const changePassword = (current_password: string, new_password: string) =>
  api.post<void>('/auth/me/password', { current_password, new_password })
