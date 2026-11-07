import { z } from 'zod'

export const CATEGORIES = ['profile', 'preferences', 'projects', 'knowledge', 'decisions', 'technical', 'temporary'] as const
export const STATUSES = ['pending', 'active', 'archived', 'rejected', 'expired', 'conflicted'] as const

export type Category = (typeof CATEGORIES)[number]
export type MemoryStatus = (typeof STATUSES)[number]

export const CATEGORY_LABEL: Record<Category, string> = {
  profile: 'Profile 個人背景',
  preferences: 'Preferences 偏好',
  projects: 'Projects 專案',
  knowledge: 'Knowledge 知識',
  decisions: 'Decisions 決策',
  technical: 'Technical 技術',
  temporary: 'Temporary 暫時',
}

export const STATUS_LABEL: Record<MemoryStatus, string> = {
  pending: '待審核',
  active: '有效',
  archived: '已封存',
  rejected: '已拒絕',
  expired: '已過期',
  conflicted: '有衝突',
}

/** 可授權讀取記憶的 AI（subject）；* = 所有 AI */
export const AI_SUBJECTS = [
  { value: '*', label: '所有 AI' },
  { value: 'chatgpt', label: 'ChatGPT' },
  { value: 'claude', label: 'Claude' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'ollama', label: 'Ollama / Local' },
] as const

export const subjectLabel = (s: string) => AI_SUBJECTS.find((a) => a.value === s)?.label ?? s

export const SOURCE_TYPE_LABEL: Record<string, string> = {
  manual: '手動新增',
  api: 'REST API',
  mcp: 'MCP',
  import: '檔案匯入',
  file: '檔案匯入',
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  deepseek: 'DeepSeek',
}

export interface SourceRef {
  id: string
  type: string
  name: string
  status: string
}

export interface Memory {
  id: string
  content: string
  category: Category
  tags: string[]
  status: MemoryStatus
  confidence: number
  version: number
  visibility: string[]
  source: SourceRef | null
  source_id: string | null
  /** AI 修改提案：被修改的原記憶 ID（核准後套用到原記憶） */
  proposal_for?: string | null
  created_by: string
  created_at: string
  updated_at: string
  last_accessed_at: string | null
  expires_at: string | null
  review_at: string | null
}

export interface MemoryVersion {
  id: string
  version: number
  content: string
  category: Category
  status: MemoryStatus
  confidence: number
  tags: string[]
  changed_by: string
  change_reason: string | null
  created_at: string
}

export interface SearchHit {
  memory: Memory
  score: number
  matched_by: ('keyword' | 'semantic')[]
}

export interface SearchResult {
  query: string
  mode: string
  semantic_available: boolean
  items: SearchHit[]
}

/** 表單（新增 / 編輯共用）；tags 以逗號分隔輸入 */
export const memoryInput = z.object({
  content: z.string().trim().min(1, '請輸入記憶內容').max(10000, '最多 10000 字'),
  category: z.enum(CATEGORIES),
  tags: z.string().max(1000),
  confidence: z.number().min(0).max(1),
  visibility: z.array(z.string()),
  status: z.enum(STATUSES),
  expires_at: z.string(),
  change_reason: z.string().max(500),
})

export type MemoryInput = z.infer<typeof memoryInput>

export const emptyMemory: MemoryInput = {
  content: '',
  category: 'knowledge',
  tags: '',
  confidence: 1,
  visibility: [],
  status: 'active',
  expires_at: '',
  change_reason: '',
}

export const splitTags = (s: string) =>
  Array.from(new Set(s.split(/[,，、;]/).map((t) => t.trim().toLowerCase()).filter(Boolean)))

/** 表單值 → API body */
export function toPayload(v: MemoryInput, editing: boolean) {
  const body: Record<string, unknown> = {
    content: v.content,
    category: v.category,
    tags: splitTags(v.tags),
    confidence: v.confidence,
    visibility: v.visibility,
    expires_at: v.expires_at ? new Date(v.expires_at).toISOString() : null,
  }
  if (editing) {
    body.status = v.status
    if (v.change_reason) body.change_reason = v.change_reason
  } else if (v.status === 'pending' || v.status === 'active') body.status = v.status
  return body
}

export function fromMemory(m: Memory): MemoryInput {
  return {
    content: m.content,
    category: m.category,
    tags: m.tags.join(', '),
    confidence: m.confidence,
    visibility: m.visibility,
    status: m.status,
    expires_at: m.expires_at ? m.expires_at.slice(0, 10) : '',
    change_reason: '',
  }
}
