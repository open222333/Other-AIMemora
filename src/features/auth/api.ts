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
