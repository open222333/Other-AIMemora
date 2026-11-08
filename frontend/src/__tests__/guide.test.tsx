import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import guide from '@/content/user-guide.md?raw'
import { parseToc, slugify } from '@/features/help/toc'
import { renderApp } from '@/test/render'

describe('user guide', () => {
  it('every in-page link points to an existing heading', () => {
    const ids = new Set(parseToc(guide).map((t) => t.id))
    const links = [...guide.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1])
    expect(links.length).toBeGreaterThan(0)
    for (const l of links) expect(ids, `#${l}`).toContain(l)
    expect(slugify('讓 AI 使用記憶')).toBe('讓-ai-使用記憶')
  })

  it('is reachable from the login page without signing in', async () => {
    const { router } = renderApp('/login')
    await userEvent.click(await screen.findByRole('link', { name: /查看使用教學/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/guide'))
    expect(await screen.findByRole('heading', { level: 1, name: 'MEMORA 使用教學' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '讓 AI 使用記憶' })).toHaveAttribute('id', '讓-ai-使用記憶')
    expect(screen.getByRole('link', { name: '回到登入' })).toBeInTheDocument()
  })

  it('is available inside the app after signing in', async () => {
    renderApp('/dashboard', { as: 'admin' })
    // 側欄、頂欄說明圖示、Dashboard 快速操作都有入口
    const links = await screen.findAllByRole('link', { name: '使用教學' })
    expect(links.length).toBeGreaterThanOrEqual(3)
    await userEvent.click(links[0])
    expect(await screen.findByRole('heading', { level: 1, name: 'MEMORA 使用教學' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '目錄' })).toBeInTheDocument()
  })
})
