import { useQuery } from '@tanstack/react-query'

import { toPaginated } from '@/api/adapters'
import { api } from '@/api/client'
import type { AuditEntry } from '@/features/system/api'

export interface Stats {
  total: number
  active: number
  pending: number
  archived: number
  conflicted: number
  by_status: Record<string, number>
  by_category: Record<string, number>
  sources: number
  ai_connections: number
  api_keys: number
  storage_bytes: number
  growth: { date: string; created: number; total: number }[]
}

export const useStats = () =>
  useQuery({ queryKey: ['stats'], queryFn: ({ signal }) => api.get<Stats>('/stats', undefined, signal) })

export const useActivity = (pageSize = 8) =>
  useQuery({
    queryKey: ['activity', 'recent', pageSize],
    queryFn: async ({ signal }) =>
      toPaginated<AuditEntry>(await api.get('/activity', { page_size: pageSize }, signal)).items,
  })
