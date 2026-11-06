/** 專案資源：API 呼叫 + React Query hooks。新增資源時複製此檔改路徑與型別。 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { toListQuery, toPaginated } from '@/api/adapters'
import { api } from '@/api/client'
import type { ListParams } from '@/api/types'

import type { Project, ProjectInput } from './schema'

const BASE = '/projects'

export const projectKeys = {
  all: ['projects'] as const,
  list: (p: ListParams) => [...projectKeys.all, 'list', p] as const,
  detail: (id: string) => [...projectKeys.all, 'detail', id] as const,
}

export function useProjects(params: ListParams) {
  return useQuery({
    queryKey: projectKeys.list(params),
    queryFn: async ({ signal }) => toPaginated<Project>(await api.get(BASE, toListQuery(params), signal), params),
    placeholderData: keepPreviousData, // 換頁時保留舊資料，避免表格閃爍
  })
}

export function useProject(id: string | null) {
  return useQuery({
    queryKey: projectKeys.detail(id ?? ''),
    queryFn: ({ signal }) => api.get<Project>(`${BASE}/${id}`, undefined, signal),
    enabled: !!id,
  })
}

export function useSaveProject() {
  const qc = useQueryClient()
  return useMutation({
    meta: { silent: true }, // 由表單顯示錯誤
    mutationFn: ({ id, data }: { id?: string; data: ProjectInput }) =>
      id ? api.patch<Project>(`${BASE}/${id}`, data) : api.post<Project>(BASE, data),
    onSuccess: (p, { id }) => {
      qc.invalidateQueries({ queryKey: projectKeys.all })
      toast.success(id ? `已更新「${p.name}」` : `已建立「${p.name}」`)
    },
  })
}

export function useDeleteProjects() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) =>
      ids.length === 1 ? api.delete(`${BASE}/${ids[0]}`) : api.post(`${BASE}/bulk-delete`, { ids }),
    onSuccess: (_r, ids) => {
      qc.invalidateQueries({ queryKey: projectKeys.all })
      toast.success(`已刪除 ${ids.length} 筆`)
    },
  })
}
