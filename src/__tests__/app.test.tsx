import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { renderApp } from '@/test/render'

describe('app', () => {
  it('redirects to login, signs in, and shows the projects table', async () => {
    const { router } = renderApp('/projects?status=archived')
    expect(await screen.findByRole('button', { name: '登入' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')

    await userEvent.click(screen.getByRole('button', { name: '登入' })) // mock 模式預填 admin / admin
    await waitFor(() => expect(router.state.location.pathname).toBe('/projects'))
    expect(router.state.location.search).toBe('?status=archived')

    const table = await screen.findByRole('table')
    await waitFor(() => expect(within(table).getAllByText('已封存').length).toBeGreaterThan(0))
    expect(within(table).queryByText('進行中')).not.toBeInTheDocument()
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

  it('renders 404 inside layout', async () => {
    localStorage.setItem('dashboard:auth', JSON.stringify({ state: { token: 'mock-token:admin', user: null }, version: 0 }))
    const { useAuth } = await import('@/features/auth/store')
    await useAuth.persist.rehydrate()
    renderApp('/does-not-exist')
    expect(await screen.findByText('找不到頁面', { selector: 'h1' })).toBeInTheDocument()
  })
})
