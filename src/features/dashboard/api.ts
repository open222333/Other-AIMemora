import { useQuery } from '@tanstack/react-query'

import { toPaginated } from '@/api/adapters'
import { api } from '@/api/client'

export interface Stats {
  total: number
  active: number
  paused: number
  archived: number
  high_priority: number
}

export interface Activity {
  id: string
  actor: string
  action: string
  target: string
  at: string
}

export const useStats = () =>
  useQuery({ queryKey: ['stats'], queryFn: ({ signal }) => api.get<Stats>('/stats', undefined, signal) })

export const useActivity = () =>
  useQuery({
    queryKey: ['activity'],
    queryFn: async ({ signal }) => toPaginated<Activity>(await api.get('/activity', undefined, signal)).items,
  })
