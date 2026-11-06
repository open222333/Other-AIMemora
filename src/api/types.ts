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
}

export interface Session {
  token: string
  refreshToken?: string
  user: User
}
