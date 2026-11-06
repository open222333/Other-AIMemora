/**
 * 後端回應格式轉換：串接不同後端時只改這個檔案。
 * 預設同時相容 FastAPI 風格（access_token、detail）與 Template-PythonFlaskAPI（token、message）。
 */
import type { ListParams, Paginated, Session, User } from './types'

type Raw = Record<string, unknown>

/** 列表查詢參數 → query string 物件（後端用 page_size / limit+offset 時改這裡） */
export function toListQuery(p: ListParams): Record<string, string | number | boolean | undefined> {
  const { pageSize, ...rest } = p
  return { ...rest, page_size: pageSize }
}

/** 支援 {items,total,page,page_size}、{data,total}、純陣列 */
export function toPaginated<T>(raw: unknown, p: ListParams = {}): Paginated<T> {
  if (Array.isArray(raw)) return { items: raw as T[], total: raw.length, page: 1, pageSize: raw.length }
  const r = raw as Raw
  const items = (r.items ?? r.data ?? r.results ?? []) as T[]
  return {
    items,
    total: Number(r.total ?? r.count ?? items.length),
    page: Number(r.page ?? p.page ?? 1),
    pageSize: Number(r.page_size ?? r.pageSize ?? p.pageSize ?? items.length),
  }
}

export function toUser(raw: Raw): User {
  return {
    id: String(raw.id ?? raw._id ?? raw.username ?? ''),
    username: String(raw.username ?? ''),
    name: String(raw.name ?? raw.display_name ?? raw.username ?? ''),
    email: raw.email ? String(raw.email) : undefined,
    role: (raw.role as User['role']) ?? 'viewer',
  }
}

/** 登入回應：{access_token, user} 或 Flask 範本的 {token, role}（無 user 時以帳號補上） */
export function toSession(raw: Raw, username: string): Session {
  const token = String(raw.access_token ?? raw.token ?? '')
  if (!token) throw new Error('登入回應缺少 token')
  const user = raw.user ? toUser(raw.user as Raw) : toUser({ username, role: raw.role })
  return { token, refreshToken: (raw.refresh_token as string) ?? undefined, user }
}

/** 錯誤訊息：FastAPI detail（字串或驗證錯誤陣列）/ message / error */
export function toErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return typeof body === 'string' && body ? body : fallback
  const b = body as Raw
  if (typeof b.detail === 'string') return b.detail
  if (Array.isArray(b.detail)) {
    return b.detail
      .map((d: Raw) => [Array.isArray(d.loc) ? d.loc.slice(1).join('.') : '', d.msg].filter(Boolean).join('：'))
      .join('；')
  }
  return String(b.message ?? b.error ?? fallback)
}
