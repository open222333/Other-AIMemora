/** Mock 資料（記憶體內，重新整理即重置）。欄位與 features/projects/schema.ts 對應。 */
import type { User } from '../types'

export type ProjectStatus = 'active' | 'paused' | 'archived'
export type ProjectPriority = 'low' | 'medium' | 'high'

export interface ProjectRecord {
  id: string
  name: string
  description: string
  status: ProjectStatus
  priority: ProjectPriority
  owner: string
  created_at: string
  updated_at: string
}

export interface ActivityRecord {
  id: string
  actor: string
  action: string
  target: string
  at: string
}

export const USERS: (User & { password: string })[] = [
  { id: 'u_1', username: 'admin', name: '系統管理員', email: 'admin@example.com', role: 'admin', password: 'admin' },
  { id: 'u_2', username: 'viewer', name: '檢視者', email: 'viewer@example.com', role: 'viewer', password: 'viewer' },
]

const NAMES = ['記憶平台', '備份系統', '爬蟲排程', '監控告警', '向量搜尋', '視覺工具', '後台管理', '通知中心', '資料匯入', '報表服務']
const SUFFIX = ['API', '前端', '重構', 'v2', '遷移', 'PoC']
const OWNERS = ['Tom', 'Amy', 'Ken', 'Lia', 'Max']
const STATUSES: ProjectStatus[] = ['active', 'active', 'paused', 'archived']
const PRIORITIES: ProjectPriority[] = ['low', 'medium', 'high']

function seededRandom(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

export function createDb(count = 57) {
  const rand = seededRandom(42)
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)]
  const base = Date.UTC(2026, 10, 5)
  const projects: ProjectRecord[] = Array.from({ length: count }, (_, i) => {
    const created = new Date(base - Math.floor(rand() * 180) * 86400000)
    const updated = new Date(created.getTime() + Math.floor(rand() * 30) * 86400000)
    return {
      id: `prj_${String(i + 1).padStart(4, '0')}`,
      name: `${pick(NAMES)} ${pick(SUFFIX)}`,
      description: '範例專案，由 mock API 產生。',
      status: pick(STATUSES),
      priority: pick(PRIORITIES),
      owner: pick(OWNERS),
      created_at: created.toISOString(),
      updated_at: (updated.getTime() > base ? created : updated).toISOString(),
    }
  })
  const activity: ActivityRecord[] = projects.slice(0, 8).map((p, i) => ({
    id: `act_${i}`,
    actor: p.owner,
    action: pick(['建立了', '更新了', '封存了']),
    target: p.name,
    at: p.updated_at,
  }))
  activity.sort((a, b) => b.at.localeCompare(a.at))
  return { users: USERS, projects, activity, seq: count }
}
