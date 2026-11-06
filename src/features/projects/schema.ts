import { z } from 'zod'

export const PROJECT_STATUS = ['active', 'paused', 'archived'] as const
export const PROJECT_PRIORITY = ['low', 'medium', 'high'] as const

export const STATUS_LABEL: Record<(typeof PROJECT_STATUS)[number], string> = {
  active: '進行中',
  paused: '暫停',
  archived: '已封存',
}
export const PRIORITY_LABEL: Record<(typeof PROJECT_PRIORITY)[number], string> = {
  low: '低',
  medium: '中',
  high: '高',
}

/** 表單 / 送出內容（新增、編輯共用） */
export const projectInput = z.object({
  name: z.string().trim().min(1, '請輸入名稱').max(100, '最多 100 字'),
  description: z.string().max(500, '最多 500 字'),
  status: z.enum(PROJECT_STATUS),
  priority: z.enum(PROJECT_PRIORITY),
  owner: z.string().trim().min(1, '請輸入負責人'),
})

export type ProjectInput = z.infer<typeof projectInput>

export interface Project extends ProjectInput {
  id: string
  created_at: string
  updated_at: string
}

export const emptyProject: ProjectInput = { name: '', description: '', status: 'active', priority: 'medium', owner: '' }
