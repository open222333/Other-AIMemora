import { describe, expect, it } from 'vitest'

import { createMockTransport } from '@/api/mock'

const call = async (t: ReturnType<typeof createMockTransport>, method: string, url: string, body?: unknown, token = 'mock-token:admin') => {
  const res = await t(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: res.status === 204 ? null : await res.json() }
}

describe('mock api', () => {
  const t = createMockTransport({ latencyMs: 0 })

  it('requires auth except health', async () => {
    expect((await call(t, 'GET', '/api/v1/memories', undefined, '')).status).toBe(401)
    expect((await call(t, 'GET', '/api/v1/health', undefined, '')).status).toBe(200)
    const login = await call(t, 'POST', '/api/v1/auth/login', { username: 'admin', password: 'admin' }, '')
    expect(login.body.access_token).toBeUndefined()
    expect(login.body.user.username).toBe('admin')
    expect(login.body.user.password).toBeUndefined()
  })

  it('filters, sorts and paginates memories', async () => {
    const { body } = await call(t, 'GET', '/api/v1/memories?category=technical,profile&sort=content&order=asc&page=1&page_size=3')
    expect(body.items).toHaveLength(3)
    expect(body.items.every((m: { category: string }) => ['technical', 'profile'].includes(m.category))).toBe(true)
    const contents = body.items.map((m: { content: string }) => m.content)
    expect([...contents].sort((a, b) => a.localeCompare(b))).toEqual(contents)
  })

  it('creates with versions, rejects duplicates, viewer is read-only', async () => {
    const created = await call(t, 'POST', '/api/v1/memories', { content: '測試記憶', category: 'knowledge', tags: ['x'] })
    expect(created.status).toBe(201)
    expect(created.body.version).toBe(1)
    const dup = await call(t, 'POST', '/api/v1/memories', { content: ' 測試記憶 ', category: 'knowledge' })
    expect(dup.status).toBe(409)
    expect(dup.body.existing_id).toBe(created.body.id)
    const updated = await call(t, 'PATCH', `/api/v1/memories/${created.body.id}`, { content: '測試記憶 v2' })
    expect(updated.body.version).toBe(2)
    const versions = await call(t, 'GET', `/api/v1/memories/${created.body.id}/versions`)
    expect(versions.body.map((v: { version: number }) => v.version)).toEqual([2, 1])
    expect((await call(t, 'DELETE', `/api/v1/memories/${created.body.id}`, undefined, 'mock-token:viewer')).status).toBe(403)
    expect((await call(t, 'DELETE', `/api/v1/memories/${created.body.id}`)).status).toBe(204)
    expect((await call(t, 'GET', `/api/v1/memories/${created.body.id}`)).status).toBe(404)
  })

  it('searches by keyword', async () => {
    const { body } = await call(t, 'POST', '/api/v1/memories/search', { query: 'RTX 4090' })
    expect(body.items[0].memory.content).toContain('RTX 4090')
  })

  it('approving an AI proposal applies it to the original memory', async () => {
    const before = await call(t, 'GET', '/api/v1/memories/mem_demo0098')
    expect(before.body.proposal_for).toBe('mem_demo0004')
    await call(t, 'POST', '/api/v1/memories/bulk', { action: 'activate', ids: ['mem_demo0098'] })
    expect((await call(t, 'GET', '/api/v1/memories/mem_demo0098')).status).toBe(404)
    const target = await call(t, 'GET', '/api/v1/memories/mem_demo0004')
    expect(target.body.content).toContain('已完成 Phase 1')
    expect(target.body.version).toBe(2)
  })
})
