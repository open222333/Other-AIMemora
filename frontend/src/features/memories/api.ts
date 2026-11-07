/** 記憶：API 呼叫 + React Query hooks */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { toListQuery, toPaginated } from '@/api/adapters'
import { api } from '@/api/client'
import type { ListParams } from '@/api/types'

import type { Memory, MemoryVersion, SearchResult } from './schema'

const BASE = '/memories'

export const memoryKeys = {
  all: ['memories'] as const,
  list: (p: ListParams) => [...memoryKeys.all, 'list', p] as const,
  detail: (id: string) => [...memoryKeys.all, 'detail', id] as const,
  versions: (id: string) => [...memoryKeys.all, 'versions', id] as const,
  search: (body: unknown) => [...memoryKeys.all, 'search', body] as const,
}

/** 會影響總覽數字的資料變更後一起刷新 */
function invalidateAll(qc: ReturnType<typeof useQueryClient>, skipDetailIds: string[] = []) {
  qc.invalidateQueries({
    queryKey: memoryKeys.all,
    predicate: (q) => !(q.queryKey[1] === 'detail' && skipDetailIds.includes(q.queryKey[2] as string)),
  })
  qc.invalidateQueries({ queryKey: ['stats'] })
  qc.invalidateQueries({ queryKey: ['activity'] })
  qc.invalidateQueries({ queryKey: ['sources'] })
}

export function useMemories(params: ListParams) {
  return useQuery({
    queryKey: memoryKeys.list(params),
    queryFn: async ({ signal }) => toPaginated<Memory>(await api.get(BASE, toListQuery(params), signal), params),
    placeholderData: keepPreviousData,
  })
}

export function useMemory(id: string | null) {
  return useQuery({
    queryKey: memoryKeys.detail(id ?? ''),
    queryFn: ({ signal }) => api.get<Memory>(`${BASE}/${id}`, undefined, signal),
    enabled: !!id,
  })
}

export function useMemoryVersions(id: string | null, enabled = true) {
  return useQuery({
    queryKey: memoryKeys.versions(id ?? ''),
    queryFn: ({ signal }) => api.get<MemoryVersion[]>(`${BASE}/${id}/versions`, undefined, signal),
    enabled: !!id && enabled,
  })
}

export interface SearchBody {
  query: string
  mode: 'hybrid' | 'keyword' | 'semantic'
  limit?: number
  category?: string[]
}

export function useSearch(body: SearchBody | null) {
  return useQuery({
    queryKey: memoryKeys.search(body),
    queryFn: () => api.post<SearchResult>(`${BASE}/search`, body),
    enabled: !!body?.query,
    placeholderData: keepPreviousData,
  })
}

export function useSaveMemory() {
  const qc = useQueryClient()
  return useMutation({
    meta: { silent: true }, // 由表單顯示錯誤
    mutationFn: ({ id, data }: { id?: string; data: Record<string, unknown> }) =>
      id ? api.patch<Memory>(`${BASE}/${id}`, data) : api.post<Memory>(BASE, data),
    onSuccess: (_m, { id }) => {
      invalidateAll(qc)
      toast.success(id ? '已更新記憶' : '已新增記憶')
    },
  })
}

/** 審核 / 封存等狀態變更 */
export function useSetStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: 'activate' | 'archive' | 'reject' }) =>
      api.post<{ affected: number }>(`${BASE}/bulk`, { action, ids }),
    onSuccess: (r, { ids, action }) => {
      // 核准修改提案後提案會被移除（內容併入原記憶），不重新抓取已不存在的明細
      invalidateAll(qc, action === 'activate' ? ids : [])
      const label = { activate: '核准', archive: '封存', reject: '拒絕' }[action]
      toast.success(`已${label} ${r.affected} 筆`)
    },
  })
}

export function useDeleteMemories() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) =>
      ids.length === 1 ? api.delete(`${BASE}/${ids[0]}`) : api.post(`${BASE}/bulk`, { action: 'delete', ids }),
    onSuccess: (_r, ids) => {
      invalidateAll(qc)
      toast.success(`已刪除 ${ids.length} 筆`)
    },
  })
}
