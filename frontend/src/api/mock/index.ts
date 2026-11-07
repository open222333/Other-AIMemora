/**
 * Mock API：VITE_API_MOCK=true 時取代 fetch，不需後端即可開發（Demo Data）。
 * 行為盡量貼近 backend/（權限、去重、版本、審核），但只是示範，正式行為以後端為準。
 */
import type { Transport } from '../client'
import { createDb, type MemoryRecord, type MockDb } from './db'
import { MockRouter, error, file, json } from './router'

const TOKEN_PREFIX = 'mock-token:'
const CATEGORIES = ['profile', 'preferences', 'projects', 'knowledge', 'decisions', 'technical', 'temporary']

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const key = (s: string) => norm(s).toLowerCase()

export function createMockTransport({
  latencyMs = 250,
  db = createDb(),
  session = null,
}: {
  latencyMs?: number
  db?: MockDb
  /** 模擬瀏覽器 cookie 中的登入 session（帳號） */
  session?: string | null
} = {}): Transport {
  const router = new MockRouter()
  // 模擬 httpOnly cookie：登入後由「後端」記住，前端程式碼拿不到
  let sessionUser: string | null = session
  const now = () => new Date().toISOString()
  const nextId = (prefix: string) => `${prefix}_mock${String(++db.seq).padStart(5, '0')}`

  /** 測試可用 Authorization: Bearer mock-token:<帳號>；瀏覽器情境用模擬的 cookie session */
  const currentUser = (headers: Headers) => {
    const auth = headers.get('Authorization') ?? ''
    const username = auth.startsWith(`Bearer ${TOKEN_PREFIX}`) ? auth.slice(`Bearer ${TOKEN_PREFIX}`.length) : sessionUser
    return db.users.find((u) => u.username === username)
  }
  const publicUser = ({ password: _password, ...u }: (typeof db.users)[number]) => u
  const isViewer = (h: Headers) => currentUser(h)?.role === 'viewer'
  const actor = (h: Headers) => `user:${currentUser(h)?.username ?? '?'}`
  const log = (h: Headers, action: string, targetId: string | null = null, detail: Record<string, unknown> = {}) =>
    db.audit.unshift({
      id: db.audit.length + 1,
      actor_type: 'user',
      actor_id: currentUser(h)?.id ?? null,
      actor_name: currentUser(h)?.username ?? '?',
      action,
      target_type: targetId ? 'memory' : null,
      target_id: targetId,
      result: 'success',
      detail,
      created_at: now(),
    })

  const out = (m: MemoryRecord) => {
    const s = db.sources.find((x) => x.id === m.source_id)
    return { ...m, proposal_for: m.proposal_for ?? null, tags: [...m.tags].sort(), source: s ? { id: s.id, type: s.type, name: s.name, status: s.status } : null }
  }
  const snapshot = (m: MemoryRecord, by: string, reason: string | null) =>
    db.versions.push({
      id: nextId('ver'),
      memory_id: m.id,
      version: m.version,
      content: m.content,
      category: m.category,
      status: m.status,
      confidence: m.confidence,
      tags: [...m.tags],
      changed_by: by,
      change_reason: reason,
      created_at: now(),
    })
  const dupOf = (content: string, exclude?: string) =>
    db.memories.find((m) => m.id !== exclude && m.status !== 'rejected' && key(m.content) === key(content))?.id

  function create(body: Record<string, unknown>, h: Headers, sourceId = 'src_manual') {
    const content = norm(String(body.content ?? ''))
    if (!content) return json({ detail: [{ loc: ['body', 'content'], msg: '內容不可為空白' }] }, 422)
    if (!CATEGORIES.includes(String(body.category))) return json({ detail: [{ loc: ['body', 'category'], msg: '未知的分類' }] }, 422)
    const dup = dupOf(content)
    if (dup) return json({ detail: '已有相同內容的記憶', existing_id: dup }, 409)
    const t = now()
    const m: MemoryRecord = {
      id: nextId('mem'),
      content,
      category: String(body.category),
      tags: [...new Set(((body.tags as string[]) ?? []).map((x) => x.toLowerCase()))],
      status: body.status === 'pending' ? 'pending' : 'active',
      confidence: Number(body.confidence ?? 1),
      version: 1,
      visibility: (body.visibility as string[]) ?? [...db.settings.default_visibility],
      source_id: sourceId,
      created_by: actor(h),
      created_at: t,
      updated_at: t,
      last_accessed_at: null,
      expires_at: (body.expires_at as string) ?? null,
      review_at: null,
    }
    db.memories.unshift(m)
    snapshot(m, m.created_by, 'created')
    log(h, 'memory.create', m.id, { category: m.category })
    return json(out(m), 201)
  }

  function update(m: MemoryRecord, patch: Record<string, unknown>, h: Headers) {
    let changed = false
    if (typeof patch.content === 'string' && norm(patch.content) !== m.content) {
      const dup = dupOf(patch.content, m.id)
      if (dup) return json({ detail: '已有相同內容的記憶', existing_id: dup }, 409)
      m.content = norm(patch.content)
      changed = true
    }
    for (const f of ['category', 'status', 'confidence'] as const) {
      if (patch[f] !== undefined && patch[f] !== m[f]) {
        ;(m as unknown as Record<string, unknown>)[f] = patch[f]
        changed = true
      }
    }
    if (Array.isArray(patch.tags) && JSON.stringify([...patch.tags].sort()) !== JSON.stringify([...m.tags].sort())) {
      m.tags = patch.tags as string[]
      changed = true
    }
    if (Array.isArray(patch.visibility)) m.visibility = [...(patch.visibility as string[])].sort()
    if ('expires_at' in patch) m.expires_at = (patch.expires_at as string) ?? null
    m.updated_at = now()
    if (changed) {
      m.version += 1
      snapshot(m, actor(h), (patch.change_reason as string) ?? null)
    }
    log(h, 'memory.update', m.id)
    return json(out(m))
  }

  // ── auth ──
  router.on('POST', '/auth/login', ({ body }) => {
    const { username, password } = (body ?? {}) as Record<string, string>
    const user = db.users.find((u) => u.username === username && u.password === password)
    if (!user) return error(401, '帳號或密碼錯誤')
    sessionUser = user.username
    return json({ user: publicUser(user) })
  })
  router.on('POST', '/auth/logout', () => {
    sessionUser = null
    return undefined
  })
  router.on('POST', '/auth/logout-all', () => {
    sessionUser = null
    return undefined
  })
  router.on('POST', '/auth/me/password', ({ headers, body }) => {
    const user = currentUser(headers)!
    const b = body as { current_password: string; new_password: string }
    if (b.current_password !== user.password) return error(400, '目前密碼不正確')
    if (b.new_password.length < 8) return json({ detail: [{ loc: ['body', 'new_password'], msg: '至少 8 個字元' }] }, 422)
    user.password = b.new_password
    return undefined
  })
  router.on('GET', '/auth/me', ({ headers }) => {
    const user = currentUser(headers)
    return user ? json(publicUser(user)) : error(401, '未登入或登入已過期')
  })
  router.on('PATCH', '/auth/me/preferences', ({ headers, body }) => {
    const user = currentUser(headers)!
    user.preferences = { ...user.preferences, ...(body as object) }
    return json(publicUser(user))
  })

  // ── dashboard ──
  router.on('GET', '/stats', () => {
    const count = (f: (m: MemoryRecord) => boolean) => db.memories.filter(f).length
    const by = <K extends 'status' | 'category'>(k: K) =>
      db.memories.reduce<Record<string, number>>((acc, m) => ((acc[m[k]] = (acc[m[k]] ?? 0) + 1), acc), {})
    const days = 30
    const today = new Date(now().slice(0, 10))
    const growth = Array.from({ length: days }, (_, i) => {
      const d = new Date(today.getTime() - (days - 1 - i) * 86400000).toISOString().slice(0, 10)
      return {
        date: d,
        created: count((m) => m.created_at.slice(0, 10) === d),
        total: count((m) => m.created_at.slice(0, 10) <= d),
      }
    })
    return json({
      total: db.memories.length,
      active: count((m) => m.status === 'active'),
      pending: count((m) => m.status === 'pending'),
      archived: count((m) => m.status === 'archived'),
      conflicted: count((m) => m.status === 'conflicted'),
      by_status: by('status'),
      by_category: by('category'),
      sources: db.sources.length,
      ai_connections: 0,
      api_keys: db.apiKeys.filter((k) => !k.revoked_at).length,
      storage_bytes: 9_437_184,
      growth,
    })
  })
  router.on('GET', '/activity', ({ query }) => {
    let rows = db.audit
    const actorType = query.get('actor_type')
    if (actorType) rows = rows.filter((a) => actorType.split(',').includes(a.actor_type))
    const page = Number(query.get('page') ?? 1)
    const size = Number(query.get('page_size') ?? 10)
    return json({ items: rows.slice((page - 1) * size, page * size), total: rows.length, page, page_size: size })
  })
  router.on('GET', '/health', () =>
    json({ status: 'ok', version: '0.1.0-demo', database: 'ok', pgvector: 'ok', embedding: 'disabled', time: now() }),
  )

  // ── memories ──
  router.on('GET', '/memories', ({ query }) => {
    let rows = [...db.memories]
    const q = query.get('q')?.toLowerCase()
    if (q) rows = rows.filter((m) => m.content.toLowerCase().includes(q) || m.id === q)
    for (const k of ['status', 'category'] as const) {
      const v = query.get(k)
      if (v) rows = rows.filter((m) => v.split(',').includes(m[k]))
    }
    const tag = query.get('tag')
    if (tag) rows = rows.filter((m) => tag.split(',').some((t) => m.tags.includes(t)))
    const st = query.get('source_type')
    if (st) rows = rows.filter((m) => st.split(',').includes(db.sources.find((s) => s.id === m.source_id)?.type ?? ''))
    const sid = query.get('source_id')
    if (sid) rows = rows.filter((m) => m.source_id === sid)
    const sort = (query.get('sort') ?? 'updated_at') as keyof MemoryRecord
    const dir = query.get('order') === 'asc' ? 1 : -1
    rows.sort((a, b) => String(a[sort] ?? '').localeCompare(String(b[sort] ?? '')) * dir)
    const page = Math.max(1, Number(query.get('page') ?? 1))
    const pageSize = Math.min(100, Math.max(1, Number(query.get('page_size') ?? 20)))
    return json({ items: rows.slice((page - 1) * pageSize, page * pageSize).map(out), total: rows.length, page, page_size: pageSize })
  })
  router.on('POST', '/memories/search', ({ body }) => {
    const { query = '', limit = 10, category } = (body ?? {}) as { query?: string; limit?: number; category?: string[] }
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    const hits = db.memories
      .filter((m) => m.status !== 'rejected' && (!category || category.includes(m.category)))
      .map((m) => ({ m, n: terms.filter((t) => m.content.toLowerCase().includes(t) || m.tags.includes(t)).length }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, limit)
    return json({
      query,
      mode: (body as { mode?: string }).mode ?? 'hybrid',
      semantic_available: false,
      items: hits.map((h, i) => ({ memory: out(h.m), score: 1.2 / (61 + i), matched_by: ['keyword'] })),
    })
  })
  router.on('POST', '/memories/bulk', ({ body, headers }) => {
    if (isViewer(headers)) return error(403, '權限不足')
    const { action, ids = [] } = body as { action: string; ids?: string[] }
    const rows = db.memories.filter((m) => ids.includes(m.id))
    const map: Record<string, string> = { archive: 'archived', activate: 'active', reject: 'rejected' }
    if (action === 'delete') db.memories = db.memories.filter((m) => !ids.includes(m.id))
    else if (action === 'activate') {
      for (const m of rows) {
        const target = m.proposal_for && db.memories.find((x) => x.id === m.proposal_for)
        if (target) {
          // 核准修改提案：套用到原記憶並移除提案
          db.memories = db.memories.filter((x) => x.id !== m.id)
          update(target, { content: m.content, category: m.category, tags: m.tags, confidence: m.confidence, change_reason: `採納修改提案 ${m.id}` }, headers)
        } else update(m, { status: 'active', change_reason: 'bulk:activate' }, headers)
      }
    } else if (map[action]) rows.forEach((m) => update(m, { status: map[action], change_reason: `bulk:${action}` }, headers))
    log(headers, `memory.bulk_${action}`, null, { count: rows.length })
    return json({ action, affected: rows.length, created: [], errors: [] })
  })
  router.on('POST', '/memories', ({ body, headers }) =>
    isViewer(headers) ? error(403, '權限不足（需要 memories:write）') : create(body as Record<string, unknown>, headers),
  )
  router.on('GET', '/memories/:id/versions', ({ params }) => {
    if (!db.memories.some((m) => m.id === params.id)) return error(404, '找不到記憶')
    return json(db.versions.filter((v) => v.memory_id === params.id).sort((a, b) => b.version - a.version))
  })
  router.on('GET', '/memories/:id', ({ params }) => {
    const m = db.memories.find((x) => x.id === params.id)
    return m ? json(out(m)) : error(404, '找不到記憶')
  })
  router.on('PATCH', '/memories/:id', ({ params, body, headers }) => {
    if (isViewer(headers)) return error(403, '權限不足（需要 memories:write）')
    const m = db.memories.find((x) => x.id === params.id)
    return m ? update(m, body as Record<string, unknown>, headers) : error(404, '找不到記憶')
  })
  router.on('DELETE', '/memories/:id', ({ params, headers }) => {
    if (isViewer(headers)) return error(403, '權限不足（需要 memories:delete）')
    if (!db.memories.some((m) => m.id === params.id)) return error(404, '找不到記憶')
    db.memories = db.memories.filter((x) => x.id !== params.id)
    db.versions = db.versions.filter((v) => v.memory_id !== params.id)
    log(headers, 'memory.delete', params.id)
    return undefined
  })

  // ── sources ──
  router.on('GET', '/sources', () =>
    json(db.sources.map((s) => ({ ...s, memory_count: db.memories.filter((m) => m.source_id === s.id).length }))),
  )

  // ── imports（只解析 Markdown 條列與純文字行，示範用）──
  router.on('GET', '/imports', () => json(db.imports.map(({ items: _items, ...j }) => j)))
  router.on('POST', '/imports', async ({ body, headers }) => {
    if (isViewer(headers)) return error(403, '需要管理員權限')
    const fd = body as FormData
    const f = fd.get('file') as File
    const text = await f.text()
    const category = String(fd.get('default_category') ?? 'knowledge')
    const lines = text.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').trim())
    const contents = lines.filter((l) => l && !l.startsWith('#'))
    const seen = new Map<string, number>()
    const items = contents.map((content, index) => {
      const dup = dupOf(content) ?? (seen.has(key(content)) ? `#${seen.get(key(content))}` : null)
      if (!seen.has(key(content))) seen.set(key(content), index)
      return { index, content, category, tags: [], duplicate_of: dup, selected: !dup }
    })
    const job = {
      id: nextId('imp'),
      filename: f.name,
      format: f.name.endsWith('.md') ? 'markdown' : 'text',
      platform: String(fd.get('platform') ?? 'file'),
      status: items.length ? 'previewed' : 'failed',
      total: items.length,
      imported: 0,
      skipped: 0,
      failed: 0,
      items,
      errors: [],
      options: {},
      source_id: null,
      created_by: actor(headers),
      created_at: now(),
      finished_at: null,
    }
    db.imports.unshift(job)
    return json(job, 201)
  })
  router.on('GET', '/imports/:id/errors.csv', ({ params }) => {
    const j = db.imports.find((x) => x.id === params.id)
    return file(`row,message\n${(j?.errors ?? []).map((e) => `${e.row},${e.message}`).join('\n')}`, 'text/csv', `${params.id}-errors.csv`)
  })
  router.on('GET', '/imports/:id', ({ params }) => {
    const j = db.imports.find((x) => x.id === params.id)
    return j ? json(j) : error(404, '找不到匯入任務')
  })
  router.on('POST', '/imports/:id/commit', ({ params, body, headers }) => {
    const j = db.imports.find((x) => x.id === params.id)
    if (!j) return error(404, '找不到匯入任務')
    if (j.status !== 'previewed') return error(409, `任務狀態為 ${j.status}，無法匯入`)
    const { exclude = [], skip_duplicates = true, status = 'active' } = body as { exclude?: number[]; skip_duplicates?: boolean; status?: string }
    const src = { id: nextId('src'), type: j.platform === 'file' ? 'import' : j.platform, name: j.filename, reference: j.id, status: 'available', created_at: now() }
    db.sources.unshift(src)
    for (const it of j.items) {
      if (exclude.includes(it.index) || (skip_duplicates && it.duplicate_of)) j.skipped++
      else if (create({ content: it.content, category: it.category, tags: it.tags, status }, headers, src.id)?.status === 201) j.imported++
      else j.skipped++
    }
    Object.assign(j, { status: 'completed', finished_at: now(), source_id: src.id })
    return json(j)
  })
  router.on('POST', '/imports/:id/cancel', ({ params }) => {
    const j = db.imports.find((x) => x.id === params.id)
    if (!j) return error(404, '找不到匯入任務')
    Object.assign(j, { status: 'cancelled', finished_at: now() })
    return json(j)
  })
  router.on('GET', '/export', ({ query }) =>
    query.get('format') === 'csv'
      ? file(`id,content,category\n${db.memories.map((m) => `${m.id},"${m.content}",${m.category}`).join('\n')}`, 'text/csv', 'memora-export-demo.csv')
      : file(JSON.stringify({ format: 'memora.export', version: 1, memories: db.memories }, null, 2), 'application/json', 'memora-export-demo.json'),
  )

  // ── system ──
  router.on('GET', '/storage', () =>
    json({
      database: { postgres: '16 (demo)', pgvector: '0.8.0', pg_trgm: '1.6', size_bytes: 9_437_184 },
      memories: db.memories.length,
      embedding: { provider: 'disabled', model: null, base_url: null, embedded: 0, missing: null, models: [] },
      index: { vector: 'exact', keyword: 'gin_trgm_ops' },
      tables: [
        { name: 'memories', rows: db.memories.length, bytes: 81920 },
        { name: 'memory_versions', rows: db.versions.length, bytes: 65536 },
        { name: 'audit_logs', rows: db.audit.length, bytes: 32768 },
      ],
      backup: { configured: false, last_backup_at: null, note: 'Demo Data' },
    }),
  )
  router.on('GET', '/settings', () => json(db.settings))
  router.on('PATCH', '/settings', ({ body, headers }) => {
    if (isViewer(headers)) return error(403, '需要管理員權限')
    Object.assign(db.settings, body)
    return json(db.settings)
  })
  router.on('GET', '/api-keys', ({ headers }) => (isViewer(headers) ? error(403, '需要管理員權限') : json(db.apiKeys)))
  router.on('POST', '/api-keys', ({ body, headers }) => {
    const b = body as { name: string; subject: string; scopes: string[] }
    const raw = `mk_demo${Math.random().toString(36).slice(2, 14)}`
    const k = { id: nextId('key'), name: b.name, prefix: raw.slice(0, 11), scopes: b.scopes, subject: b.subject, created_by: actor(headers), created_at: now(), last_used_at: null, expires_at: null, revoked_at: null }
    db.apiKeys.unshift(k)
    return json({ ...k, key: raw }, 201)
  })
  router.on('POST', '/api-keys/:id/revoke', ({ params }) => {
    const k = db.apiKeys.find((x) => x.id === params.id)
    if (!k) return error(404, '找不到 API Key')
    k.revoked_at = now()
    return json(k)
  })
  router.on('POST', '/api-keys/:id/rotate', ({ params, headers }) => {
    const old = db.apiKeys.find((x) => x.id === params.id)
    if (!old) return error(404, '找不到 API Key')
    old.revoked_at = now()
    const raw = `mk_demo${Math.random().toString(36).slice(2, 14)}`
    const k = { ...old, id: nextId('key'), prefix: raw.slice(0, 11), created_by: actor(headers), created_at: now(), last_used_at: null, revoked_at: null }
    db.apiKeys.unshift(k)
    return json({ ...k, key: raw })
  })

  return async (input, init) => {
    const url = new URL(input, 'http://mock.local')
    const path = url.pathname.replace(/^.*?\/api\/v\d+/, '') || '/'
    const headers = new Headers(init.headers)
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body instanceof FormData ? init.body : undefined

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, latencyMs)
      init.signal?.addEventListener('abort', () => (clearTimeout(t), reject(init.signal!.reason)))
    })
    const method = (init.method ?? 'GET').toUpperCase()
    // 與後端相同：寫入請求需帶 CSRF 標頭
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && headers.get('X-Requested-With') !== 'memora' && !headers.get('Authorization')) {
      return new Response(JSON.stringify({ detail: '缺少 CSRF 防護標頭（X-Requested-With: memora）' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      })
    }
    // 非公開路由需登入
    if (!path.startsWith('/auth/login') && path !== '/auth/logout' && path !== '/health' && !currentUser(headers)) {
      return new Response(JSON.stringify({ detail: '未登入或登入已過期' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    }
    const res = await router.handle(method, path, url.searchParams, body, headers)
    const status = res?.status ?? 200
    if (res?.raw !== undefined) return new Response(res.raw, { status, headers: res.headers })
    return new Response(status === 204 || res?.body === undefined ? null : JSON.stringify(res.body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }
}
