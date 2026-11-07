/** 系統類 API：設定、健康狀態、儲存、來源、稽核紀錄、API Key */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { toListQuery, toPaginated } from '@/api/adapters'
import { api, download } from '@/api/client'
import type { ListParams } from '@/api/types'

export interface WorkspaceSettings {
  name: string
  language: string
  timezone: string
  default_visibility: string[]
  require_review_for_api: boolean
}

export interface Health {
  status: 'ok' | 'degraded'
  version: string
  database: 'ok' | 'error'
  pgvector: 'ok' | 'missing'
  embedding: string
  time: string
}

export interface StorageInfo {
  database: { postgres: string | null; pgvector: string | null; pg_trgm: string | null; size_bytes: number }
  memories: number
  embedding: {
    provider: string
    model: string | null
    base_url: string | null
    embedded: number
    missing: number | null
    models: { model: string; dim: number; count: number }[]
  }
  index: { vector: string; keyword: string }
  tables: { name: string; rows: number; bytes: number }[]
  backup: { configured: boolean; last_backup_at: string | null; note: string }
}

export interface Source {
  id: string
  type: string
  name: string
  reference: string | null
  status: string
  created_at: string
  memory_count: number
}

export interface AuditEntry {
  id: number
  actor_type: 'user' | 'api_key' | 'system'
  actor_id: string | null
  actor_name: string
  action: string
  target_type: string | null
  target_id: string | null
  result: string
  detail: Record<string, unknown>
  created_at: string
}

export interface ApiKey {
  id: string
  name: string
  prefix: string
  scopes: string[]
  subject: string | null
  created_by: string
  created_at: string
  last_used_at: string | null
  expires_at: string | null
  revoked_at: string | null
}

export const useWorkspaceSettings = () =>
  useQuery({ queryKey: ['settings'], queryFn: ({ signal }) => api.get<WorkspaceSettings>('/settings', undefined, signal) })

export function useSaveSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<WorkspaceSettings>) => api.patch<WorkspaceSettings>('/settings', patch),
    onSuccess: (data) => {
      qc.setQueryData(['settings'], data)
      toast.success('設定已儲存')
    },
  })
}

export const useHealth = () =>
  useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => api.get<Health>('/health', undefined, signal),
    refetchInterval: 60_000,
  })

export const useStorage = () =>
  useQuery({ queryKey: ['storage'], queryFn: ({ signal }) => api.get<StorageInfo>('/storage', undefined, signal) })

export const useSources = () =>
  useQuery({ queryKey: ['sources'], queryFn: ({ signal }) => api.get<Source[]>('/sources', undefined, signal) })

export function useAuditLogs(params: ListParams) {
  return useQuery({
    queryKey: ['activity', params],
    queryFn: async ({ signal }) => toPaginated<AuditEntry>(await api.get('/activity', toListQuery(params), signal), params),
  })
}

export const useApiKeys = () =>
  useQuery({ queryKey: ['api-keys'], queryFn: ({ signal }) => api.get<ApiKey[]>('/api-keys', undefined, signal) })

export function useCreateApiKey() {
  const qc = useQueryClient()
  return useMutation({
    meta: { silent: true },
    mutationFn: (body: { name: string; subject: string; scopes: string[] }) =>
      api.post<ApiKey & { key: string }>('/api-keys', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  })
}

export function useApiKeyAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'revoke' | 'rotate' }) =>
      api.post<ApiKey & { key?: string }>(`/api-keys/${id}/${action}`),
    onSuccess: (_r, { action }) => {
      qc.invalidateQueries({ queryKey: ['api-keys'] })
      if (action === 'revoke') toast.success('已撤銷 API Key')
    },
  })
}

/** 觸發瀏覽器下載 */
export async function downloadFile(path: string, fallbackName: string, query?: Record<string, string>) {
  const { blob, filename } = await download(path, query)
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename ?? fallbackName })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
