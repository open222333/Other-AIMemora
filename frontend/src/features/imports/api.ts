import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { api, request } from '@/api/client'

export interface ImportItem {
  index: number
  content: string
  category: string
  tags: string[]
  duplicate_of: string | null
  selected: boolean
}

export interface ImportJob {
  id: string
  filename: string
  format: string
  platform: string
  status: 'previewed' | 'completed' | 'failed' | 'cancelled' | 'running'
  total: number
  imported: number
  skipped: number
  failed: number
  errors: { row: number; message: string }[]
  options: Record<string, unknown>
  source_id: string | null
  created_by: string
  created_at: string
  finished_at: string | null
  items?: ImportItem[]
}

export const useImportJobs = () =>
  useQuery({ queryKey: ['imports'], queryFn: ({ signal }) => api.get<ImportJob[]>('/imports', undefined, signal) })

export const useImportJob = (id: string | null) =>
  useQuery({
    queryKey: ['imports', id],
    queryFn: ({ signal }) => api.get<ImportJob>(`/imports/${id}`, undefined, signal),
    enabled: !!id,
  })

export function useUploadImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ file, platform, defaultCategory }: { file: File; platform: string; defaultCategory: string }) => {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('platform', platform)
      fd.append('default_category', defaultCategory)
      return request<ImportJob>('POST', '/imports', { body: fd })
    },
    onSuccess: (job) => {
      qc.setQueryData(['imports', job.id], job)
      qc.invalidateQueries({ queryKey: ['imports'], exact: true })
    },
  })
}

export function useCommitImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; skip_duplicates: boolean; status: 'active' | 'pending'; exclude: number[] }) =>
      api.post<ImportJob>(`/imports/${id}/commit`, body),
    onSuccess: (job) => {
      qc.invalidateQueries({ queryKey: ['imports'] })
      qc.invalidateQueries({ queryKey: ['memories'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      qc.invalidateQueries({ queryKey: ['sources'] })
      toast.success(`已匯入 ${job.imported} 筆，略過 ${job.skipped} 筆`)
    },
  })
}

export function useCancelImport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<ImportJob>(`/imports/${id}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['imports'] })
      toast.success('已取消匯入')
    },
  })
}
