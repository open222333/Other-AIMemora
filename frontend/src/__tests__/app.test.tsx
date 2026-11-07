import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { renderApp } from '@/test/render'

describe('app', () => {
  it('redirects to login, signs in, and shows the memories table', async () => {
    const { router } = renderApp('/memories?status=pending')
    expect(await screen.findByRole('button', { name: '登入' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')

    await userEvent.click(screen.getByRole('button', { name: '登入' })) // mock 模式預填 admin / admin
    await waitFor(() => expect(router.state.location.pathname).toBe('/memories'))
    expect(router.state.location.search).toBe('?status=pending')

    const table = await screen.findByRole('table')
    await waitFor(() => expect(within(table).getAllByText('待審核').length).toBeGreaterThan(0))
    expect(within(table).queryByText('有效')).not.toBeInTheDocument()
    expect(screen.getByText(/共 \d+ 筆/)).toBeInTheDocument()
  })

  it('shows login error for wrong password', async () => {
    renderApp('/login')
    const pw = await screen.findByLabelText('密碼')
    await userEvent.clear(pw)
    await userEvent.type(pw, 'wrong')
    await userEvent.click(screen.getByRole('button', { name: '登入' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('帳號或密碼錯誤')
  })

  it('renders dashboard with real stats labels and demo notice', async () => {
    renderApp('/dashboard', { as: 'admin' })
    expect(await screen.findByText('Total Memories')).toBeInTheDocument()
    expect(screen.getByText(/Demo Data/)).toBeInTheDocument()
    expect(await screen.findByText('Memory Growth')).toBeInTheDocument()
  })

  it('creates a memory and opens it in the inspector', async () => {
    const { router } = renderApp('/memories', { as: 'admin' })
    await userEvent.click(await screen.findByRole('button', { name: /新增記憶/ }))
    await userEvent.type(await screen.findByLabelText('內容'), '喜歡深色主題')
    await userEvent.click(screen.getByRole('button', { name: '新增' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const cell = await screen.findByText('喜歡深色主題')
    await userEvent.click(cell)
    await waitFor(() => expect(router.state.location.search).toMatch(/selected=mem_/))
    expect(await screen.findByText('記憶詳細資訊')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: /版本歷史/ }))
    expect(await screen.findByText('v1')).toBeInTheDocument()
  })

  it('renders 404 inside layout', async () => {
    renderApp('/does-not-exist', { as: 'admin' })
    expect(await screen.findByText('找不到頁面', { selector: 'h1' })).toBeInTheDocument()
  })

  it('keeps no session token in localStorage and logs out via the server', async () => {
    const { router } = renderApp('/login')
    await userEvent.click(await screen.findByRole('button', { name: '登入' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'))
    const stored = localStorage.getItem('memora:auth') ?? ''
    expect(stored).toContain('admin')
    expect(stored).not.toMatch(/token/i)
    await userEvent.click(await screen.findByRole('button', { name: '帳號選單' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /登出/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })

  it('discards a legacy token persisted by older versions', async () => {
    localStorage.setItem('memora:auth', JSON.stringify({ state: { token: 'old-jwt', user: { username: 'admin' } }, version: 0 }))
    const { useAuth } = await import('@/features/auth/store')
    await useAuth.persist.rehydrate()
    expect(useAuth.getState().user).toBeNull()
    expect(localStorage.getItem('memora:auth')).not.toContain('old-jwt')
  })
})
