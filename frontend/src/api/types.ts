/** 分頁列表回應（前端統一格式；後端格式不同時在 adapters.ts 轉換） */
export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface ListParams {
  page?: number
  pageSize?: number
  q?: string
  sort?: string
  order?: 'asc' | 'desc'
  [filter: string]: string | number | boolean | undefined
}

export interface User {
  id: string
  username: string
  name: string
  email?: string
  role: 'admin' | 'operator' | 'viewer'
  preferences?: { theme?: 'light' | 'dark' | 'system'; language?: string }
}

/** 登入結果：session 本身在 httpOnly cookie，前端只拿到使用者資料 */
export interface Session {
  user: User
}
