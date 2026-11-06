/**
 * Mock API：VITE_API_MOCK=true 時取代 fetch，不需後端即可開發。
 * 新增資源：在這裡加 router.on(...)，資料放 db.ts。
 */
import type { Transport } from '../client'
import { createDb, type ProjectRecord } from './db'
import { MockRouter, error, json } from './router'

const TOKEN_PREFIX = 'mock-token:'

export function createMockTransport({ latencyMs = 300, db = createDb() } = {}): Transport {
  const router = new MockRouter()

  const currentUser = (headers: Headers) => {
    const auth = headers.get('Authorization') ?? ''
    const username = auth.startsWith(`Bearer ${TOKEN_PREFIX}`) ? auth.slice(`Bearer ${TOKEN_PREFIX}`.length) : ''
    return db.users.find((u) => u.username === username)
  }
  const publicUser = ({ password: _password, ...u }: (typeof db.users)[number]) => u

  // ── auth ──
  router.on('POST', '/auth/login', ({ body }) => {
    const { username, password } = (body ?? {}) as Record<string, string>
    const user = db.users.find((u) => u.username === username && u.password === password)
    if (!user) return error(401, '帳號或密碼錯誤')
    return json({ access_token: TOKEN_PREFIX + user.username, user: publicUser(user) })
  })
  router.on('GET', '/auth/me', ({ headers }) => {
    const user = currentUser(headers)
    return user ? json(publicUser(user)) : error(401, '未登入或登入已過期')
  })

  // ── dashboard ──
  router.on('GET', '/stats', () => {
    const by = (s: string) => db.projects.filter((p) => p.status === s).length
    return json({
      total: db.projects.length,
      active: by('active'),
      paused: by('paused'),
      archived: by('archived'),
      high_priority: db.projects.filter((p) => p.priority === 'high' && p.status === 'active').length,
    })
  })
  router.on('GET', '/activity', () => json({ items: db.activity.slice(0, 8), total: db.activity.length }))

  // ── projects（列表：q / status / priority / sort / order / page / page_size）──
  router.on('GET', '/projects', ({ query }) => {
    let rows = [...db.projects]
    const q = query.get('q')?.toLowerCase()
    if (q) rows = rows.filter((p) => p.name.toLowerCase().includes(q) || p.owner.toLowerCase().includes(q))
    for (const key of ['status', 'priority'] as const) {
      const v = query.get(key)
      if (v) rows = rows.filter((p) => v.split(',').includes(p[key]))
    }
    const sort = (query.get('sort') ?? 'updated_at') as keyof ProjectRecord
    const dir = query.get('order') === 'asc' ? 1 : -1
    rows.sort((a, b) => String(a[sort]).localeCompare(String(b[sort])) * dir)
    const page = Math.max(1, Number(query.get('page') ?? 1))
    const pageSize = Math.min(100, Math.max(1, Number(query.get('page_size') ?? 10)))
    return json({ items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, page_size: pageSize })
  })
  router.on('GET', '/projects/:id', ({ params }) => {
    const p = db.projects.find((x) => x.id === params.id)
    return p ? json(p) : error(404, '找不到專案')
  })
  router.on('POST', '/projects', ({ body, headers }) => {
    if (currentUser(headers)?.role === 'viewer') return error(403, '檢視者無法新增')
    const now = new Date().toISOString()
    const p = { ...(body as ProjectRecord), id: `prj_${String(++db.seq).padStart(4, '0')}`, created_at: now, updated_at: now }
    if (db.projects.some((x) => x.name === p.name)) return json({ detail: [{ loc: ['body', 'name'], msg: '名稱已存在' }] }, 422)
    db.projects.unshift(p)
    db.activity.unshift({ id: `act_${Date.now()}`, actor: currentUser(headers)?.name ?? '?', action: '建立了', target: p.name, at: now })
    return json(p, 201)
  })
  router.on('PATCH', '/projects/:id', ({ params, body, headers }) => {
    if (currentUser(headers)?.role === 'viewer') return error(403, '檢視者無法修改')
    const i = db.projects.findIndex((x) => x.id === params.id)
    if (i < 0) return error(404, '找不到專案')
    db.projects[i] = { ...db.projects[i], ...(body as Partial<ProjectRecord>), updated_at: new Date().toISOString() }
    return json(db.projects[i])
  })
  router.on('DELETE', '/projects/:id', ({ params, headers }) => {
    if (currentUser(headers)?.role === 'viewer') return error(403, '檢視者無法刪除')
    db.projects = db.projects.filter((x) => x.id !== params.id)
    return undefined
  })
  router.on('POST', '/projects/bulk-delete', ({ body, headers }) => {
    if (currentUser(headers)?.role === 'viewer') return error(403, '檢視者無法刪除')
    const ids = new Set(((body ?? {}) as { ids?: string[] }).ids ?? [])
    const before = db.projects.length
    db.projects = db.projects.filter((x) => !ids.has(x.id))
    return json({ deleted: before - db.projects.length })
  })

  return async (input, init) => {
    const url = new URL(input, 'http://mock.local')
    const path = url.pathname.replace(/^.*?\/api\/v\d+/, '') || '/'
    const headers = new Headers(init.headers)
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, latencyMs)
      init.signal?.addEventListener('abort', () => (clearTimeout(t), reject(init.signal!.reason)))
    })
    // 非 auth 路由需登入
    if (!path.startsWith('/auth/login') && !currentUser(headers)) {
      return new Response(JSON.stringify({ detail: '未登入或登入已過期' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    }
    const res = await router.handle((init.method ?? 'GET').toUpperCase(), path, url.searchParams, body, headers)
    const status = res?.status ?? 200
    return new Response(status === 204 || res?.body === undefined ? null : JSON.stringify(res.body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }
}
