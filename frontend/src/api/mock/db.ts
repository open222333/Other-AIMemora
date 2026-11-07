/**
 * Mock 資料（Demo Data，記憶體內，重新整理即重置）。欄位與後端 API 回應一致。
 * 僅在 VITE_API_MOCK=true 時使用；畫面上會明確標示 Demo Data。
 */
import type { User } from '../types'

export interface SourceRecord {
  id: string
  type: string
  name: string
  reference: string | null
  status: string
  created_at: string
}

export interface MemoryRecord {
  id: string
  content: string
  category: string
  tags: string[]
  status: string
  confidence: number
  version: number
  visibility: string[]
  source_id: string | null
  proposal_for?: string | null
  created_by: string
  created_at: string
  updated_at: string
  last_accessed_at: string | null
  expires_at: string | null
  review_at: string | null
}

export interface VersionRecord {
  id: string
  memory_id: string
  version: number
  content: string
  category: string
  status: string
  confidence: number
  tags: string[]
  changed_by: string
  change_reason: string | null
  created_at: string
}

export interface AuditRecord {
  id: number
  actor_type: string
  actor_id: string | null
  actor_name: string
  action: string
  target_type: string | null
  target_id: string | null
  result: string
  detail: Record<string, unknown>
  created_at: string
}

export interface ApiKeyRecord {
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

export interface ImportRecord {
  id: string
  filename: string
  format: string
  platform: string
  status: string
  total: number
  imported: number
  skipped: number
  failed: number
  items: { index: number; content: string; category: string; tags: string[]; duplicate_of: string | null; selected: boolean }[]
  errors: { row: number; message: string }[]
  options: Record<string, unknown>
  source_id: string | null
  created_by: string
  created_at: string
  finished_at: string | null
}

export const USERS: (User & { password: string })[] = [
  { id: 'usr_1', username: 'admin', name: '系統管理員', email: 'admin@example.com', role: 'admin', preferences: {}, password: 'admin' },
  { id: 'usr_2', username: 'viewer', name: '檢視者', email: 'viewer@example.com', role: 'viewer', preferences: {}, password: 'viewer' },
]

const SEED: [string, string, string[], string[]][] = [
  ['偏好使用繁體中文回答', 'preferences', ['language', 'communication'], ['*']],
  ['回答盡量簡潔，先給結論再說明', 'preferences', ['communication'], ['*']],
  ['主要開發語言是 TypeScript 與 Python', 'profile', ['programming'], ['*']],
  ['MEMORA 專案：跨 AI 共用記憶平台，自架部署', 'projects', ['memora'], ['claude', 'chatgpt']],
  ['MEMORA 前端使用 React + Vite + shadcn/ui', 'technical', ['memora', 'frontend'], ['claude']],
  ['MEMORA 後端使用 FastAPI + PostgreSQL + pgvector', 'technical', ['memora', 'backend'], ['claude']],
  ['決定先做單人自架，資料模型預留 workspace_id', 'decisions', ['memora', 'architecture'], ['claude']],
  ['主要顯示卡是 RTX 4090', 'technical', ['hardware'], []],
  ['筆電是 MacBook Air', 'technical', ['hardware'], []],
  ['時區為 Asia/Taipei', 'profile', [], ['*']],
  ['下週三要準備季度簡報', 'temporary', ['work'], []],
  ['pgvector 的 cosine 距離運算子是 <=>', 'knowledge', ['postgres'], ['*']],
]

const iso = (d: number) => new Date(d).toISOString()

export function createDb() {
  const now = Date.UTC(2026, 10, 6, 8)
  const day = 86400000
  const sources: SourceRecord[] = [
    { id: 'src_manual', type: 'manual', name: '手動新增', reference: null, status: 'available', created_at: iso(now - 40 * day) },
    { id: 'src_import', type: 'chatgpt', name: 'chatgpt-memories.md', reference: 'imp_demo', status: 'available', created_at: iso(now - 20 * day) },
    { id: 'src_api', type: 'api', name: 'REST API · claude', reference: 'key_demo', status: 'available', created_at: iso(now - 5 * day) },
  ]
  const memories: MemoryRecord[] = SEED.map(([content, category, tags, visibility], i) => {
    const created = now - (SEED.length - i) * 2.3 * day
    return {
      id: `mem_demo${String(i + 1).padStart(4, '0')}`,
      content,
      category,
      tags,
      status: 'active',
      confidence: i % 5 === 4 ? 0.8 : 1,
      version: 1,
      visibility,
      source_id: i < 4 ? 'src_import' : 'src_manual',
      created_by: 'user:admin',
      created_at: iso(created),
      updated_at: iso(created),
      last_accessed_at: visibility.length ? iso(now - i * 3600000) : null,
      expires_at: category === 'temporary' ? iso(now + 7 * day) : null,
      review_at: null,
    }
  })
  memories.push({
    id: 'mem_demo0099',
    content: '使用者改用 Gemini 作為主要 AI',
    category: 'preferences',
    tags: [],
    status: 'pending',
    confidence: 0.7,
    version: 1,
    visibility: ['claude'],
    source_id: 'src_api',
    created_by: 'api_key:Claude Desktop',
    created_at: iso(now - 3600000),
    updated_at: iso(now - 3600000),
    last_accessed_at: null,
    expires_at: null,
    review_at: null,
  })
  memories.push({
    id: 'mem_demo0098',
    content: 'MEMORA 專案：跨 AI 共用記憶平台，自架部署，已完成 Phase 1',
    category: 'projects',
    tags: ['memora'],
    status: 'pending',
    confidence: 0.9,
    version: 1,
    visibility: ['claude', 'chatgpt'],
    source_id: 'src_api',
    proposal_for: 'mem_demo0004',
    created_by: 'api_key:Claude Desktop',
    created_at: iso(now - 1800000),
    updated_at: iso(now - 1800000),
    last_accessed_at: null,
    expires_at: null,
    review_at: null,
  })
  const versions: VersionRecord[] = memories.map((m) => ({
    id: `ver_${m.id}`,
    memory_id: m.id,
    version: 1,
    content: m.content,
    category: m.category,
    status: m.status,
    confidence: m.confidence,
    tags: m.tags,
    changed_by: m.created_by,
    change_reason: 'created',
    created_at: m.created_at,
  }))
  const audit: AuditRecord[] = memories.slice(-6).map((m, i) => ({
    id: i + 1,
    actor_type: m.created_by.startsWith('api') ? 'api_key' : 'user',
    actor_id: null,
    actor_name: m.created_by.split(':')[1],
    action: 'memory.create',
    target_type: 'memory',
    target_id: m.id,
    result: 'success',
    detail: { category: m.category },
    created_at: m.created_at,
  }))
  const apiKeys: ApiKeyRecord[] = [
    {
      id: 'key_demo',
      name: 'Claude Desktop',
      prefix: 'mk_demo1234',
      scopes: ['memories:read', 'memories:write'],
      subject: 'claude',
      created_by: 'user:admin',
      created_at: iso(now - 5 * day),
      last_used_at: iso(now - 3600000),
      expires_at: null,
      revoked_at: null,
    },
  ]
  return {
    users: USERS.map((u) => ({ ...u, preferences: { ...u.preferences } })),
    sources,
    memories,
    versions,
    audit,
    apiKeys,
    imports: [] as ImportRecord[],
    settings: {
      name: 'My Memory',
      language: 'zh-TW',
      timezone: 'Asia/Taipei',
      default_visibility: [] as string[],
      require_review_for_api: true,
    },
    seq: 1000,
  }
}

export type MockDb = ReturnType<typeof createDb>
