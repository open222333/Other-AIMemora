import { describe, expect, it, vi } from 'vitest'

import { ApiError, api, buildUrl, configureClient } from '@/api/client'

const jsonRes = (body: unknown, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('api client', () => {
  it('builds urls skipping empty values', () => {
    configureClient({ baseUrl: '/api/v1' })
    expect(buildUrl('/x', { a: 1, b: '', c: undefined, d: null, e: false })).toBe('/api/v1/x?a=1&e=false')
    expect(buildUrl('y')).toBe('/api/v1/y')
  })

  it('sends token and json body', async () => {
    const transport = vi.fn(async () => jsonRes({ ok: true }))
    configureClient({ transport, getToken: () => 'tok' })
    await api.post('/items', { a: 1 })
    const [url, init] = transport.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/v1/items')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
    expect(init.body).toBe('{"a":1}')
  })

  it('converts errors and triggers onUnauthorized on 401', async () => {
    const onUnauthorized = vi.fn()
    configureClient({ transport: async () => jsonRes({ detail: '過期' }, 401), onUnauthorized })
    await expect(api.get('/me')).rejects.toMatchObject({ status: 401, message: '過期' })
    expect(onUnauthorized).toHaveBeenCalledOnce()
    configureClient({ transport: async () => new Response('boom', { status: 500 }) })
    const err = (await api.get('/x').catch((e: unknown) => e)) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.message).toBe('boom')
  })

  it('handles 204 and network failure', async () => {
    configureClient({ transport: async () => new Response(null, { status: 204 }) })
    await expect(api.delete('/x')).resolves.toBeUndefined()
    configureClient({ transport: async () => Promise.reject(new TypeError('Failed to fetch')) })
    await expect(api.get('/x')).rejects.toMatchObject({ status: 0, message: '無法連線到伺服器' })
  })
})
