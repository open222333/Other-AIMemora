import { describe, expect, it } from 'vitest'

import { toErrorMessage, toListQuery, toPaginated, toSession } from '@/api/adapters'

describe('adapters', () => {
  it('normalizes paginated responses', () => {
    expect(toPaginated({ items: [1, 2], total: 9, page: 2, page_size: 2 })).toEqual({ items: [1, 2], total: 9, page: 2, pageSize: 2 })
    expect(toPaginated({ data: [1], count: 5 }, { page: 3, pageSize: 1 })).toEqual({ items: [1], total: 5, page: 3, pageSize: 1 })
    expect(toPaginated([1, 2, 3]).total).toBe(3)
  })

  it('maps list params to query', () => {
    expect(toListQuery({ page: 2, pageSize: 20, q: 'x' })).toEqual({ page: 2, page_size: 20, q: 'x' })
  })

  it('supports FastAPI and Flask login responses', () => {
    const a = toSession({ access_token: 't1', user: { id: 1, username: 'a', name: 'A', role: 'admin' } }, 'a')
    expect(a).toMatchObject({ token: 't1', user: { id: '1', name: 'A', role: 'admin' } })
    const b = toSession({ success: true, token: 't2', role: 'operator', refresh_token: 'r' }, 'bob')
    expect(b).toMatchObject({ token: 't2', refreshToken: 'r', user: { username: 'bob', role: 'operator' } })
    expect(() => toSession({}, 'x')).toThrow('token')
  })

  it('extracts error messages', () => {
    expect(toErrorMessage({ detail: 'nope' }, 'f')).toBe('nope')
    expect(toErrorMessage({ detail: [{ loc: ['body', 'name'], msg: '必填' }] }, 'f')).toBe('name：必填')
    expect(toErrorMessage({ success: false, message: '帳號錯誤' }, 'f')).toBe('帳號錯誤')
    expect(toErrorMessage(null, 'fallback')).toBe('fallback')
  })
})
