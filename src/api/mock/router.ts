/** 迷你路由：把 fetch 請求對應到 handler，回傳 Response。 */
export interface MockRequest {
  method: string
  path: string
  params: Record<string, string>
  query: URLSearchParams
  body: unknown
  headers: Headers
}

export type MockResult = { status?: number; body?: unknown } | undefined
type Handler = (req: MockRequest) => MockResult | Promise<MockResult>

interface Route {
  method: string
  pattern: RegExp
  keys: string[]
  handler: Handler
}

export class MockRouter {
  private routes: Route[] = []

  on(method: string, path: string, handler: Handler) {
    const keys: string[] = []
    const pattern = new RegExp(
      '^' + path.replace(/:(\w+)/g, (_, k: string) => (keys.push(k), '([^/]+)')).replace(/\/$/, '') + '/?$',
    )
    this.routes.push({ method, pattern, keys, handler })
    return this
  }

  async handle(method: string, path: string, query: URLSearchParams, body: unknown, headers: Headers) {
    for (const r of this.routes) {
      if (r.method !== method) continue
      const m = path.match(r.pattern)
      if (!m) continue
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]))
      return (await r.handler({ method, path, params, query, body, headers })) ?? { status: 204 }
    }
    return { status: 404, body: { detail: `Mock API 沒有 ${method} ${path}` } }
  }
}

export const json = (body: unknown, status = 200): MockResult => ({ status, body })
export const error = (status: number, detail: string): MockResult => ({ status, body: { detail } })
