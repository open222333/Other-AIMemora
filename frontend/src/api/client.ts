/**
 * API client：fetch 包裝
 * - 登入 session 在 httpOnly cookie（JavaScript 讀不到），由瀏覽器自動帶上
 * - 每個請求帶 X-Requested-With: memora（後端 CSRF 防護要求）
 * - query 物件轉 query string（略過 undefined / 空字串）
 * - 逾時、錯誤統一轉成 ApiError（message 已轉成可顯示的文字）
 * - 401 時呼叫 onUnauthorized（登出並導向登入頁）
 */
import { env } from '@/config/env'

import { toErrorMessage } from './adapters'

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

/** 後端以 cookie 認證時，寫入請求必須帶此標頭（跨站請求無法加自訂標頭） */
export const CSRF_HEADERS = { 'X-Requested-With': 'memora' } as const

export type Transport = (input: string, init: RequestInit) => Promise<Response>
type Query = Record<string, string | number | boolean | undefined | null>

interface ClientConfig {
  baseUrl: string
  timeoutMs: number
  transport: Transport
  onUnauthorized: () => void
}

const config: ClientConfig = {
  baseUrl: env.apiBaseUrl,
  timeoutMs: env.apiTimeoutMs,
  transport: (input, init) => fetch(input, { ...init, credentials: 'same-origin' }),
  onUnauthorized: () => {},
}

export function configureClient(partial: Partial<ClientConfig>) {
  Object.assign(config, partial)
}

export function buildUrl(path: string, query?: Query): string {
  const url = `${config.baseUrl}${path.startsWith('/') ? path : `/${path}`}`
  if (!query) return url
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') qs.append(k, String(v))
  }
  const s = qs.toString()
  return s ? `${url}?${s}` : url
}

export interface RequestOptions {
  query?: Query
  body?: unknown
  signal?: AbortSignal
  headers?: Record<string, string>
}

export async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...CSRF_HEADERS, ...opts.headers }
  let body: BodyInit | undefined
  if (opts.body instanceof FormData) body = opts.body
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }

  const timeout = AbortSignal.timeout(config.timeoutMs)
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout

  let res: Response
  try {
    res = await config.transport(buildUrl(path, opts.query), { method, headers, body, signal })
  } catch (e) {
    if (opts.signal?.aborted) throw e // 呼叫端主動取消（例如 React Query），保留原錯誤
    if (e instanceof DOMException && e.name === 'TimeoutError') throw new ApiError(0, '請求逾時，請稍後再試')
    throw new ApiError(0, '無法連線到伺服器')
  }

  const text = res.status === 204 ? '' : await res.text()
  let data: unknown = text
  if (text && (res.headers.get('content-type') ?? '').includes('json')) {
    try {
      data = JSON.parse(text)
    } catch {
      /* 保留原始文字 */
    }
  }

  if (!res.ok) {
    if (res.status === 401) config.onUnauthorized()
    throw new ApiError(res.status, toErrorMessage(data, `請求失敗（HTTP ${res.status}）`), data)
  }
  return (text ? data : undefined) as T
}

/** 下載檔案（匯出、錯誤報表）：與一般請求相同的 session 與 transport，回傳 Blob 與檔名 */
export async function download(path: string, query?: Query): Promise<{ blob: Blob; filename: string | null }> {
  const headers: Record<string, string> = { ...CSRF_HEADERS }
  const res = await config.transport(buildUrl(path, query), { method: 'GET', headers, signal: AbortSignal.timeout(config.timeoutMs) })
  if (!res.ok) {
    if (res.status === 401) config.onUnauthorized()
    throw new ApiError(res.status, `下載失敗（HTTP ${res.status}）`)
  }
  const filename = res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? null
  return { blob: await res.blob(), filename }
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>('GET', path, { query, signal }),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  delete: <T = void>(path: string, body?: unknown) => request<T>('DELETE', path, { body }),
}
