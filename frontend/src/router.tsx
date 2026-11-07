import type * as React from 'react'
/** 路由：handle.crumb 會顯示在頂欄麵包屑。新增頁面時同步更新 config/nav.ts。 */
import { createBrowserRouter, Navigate } from 'react-router'

import { AppLayout } from '@/components/layout/app-layout'
import { DashboardPage } from '@/pages/dashboard'
import { NotFoundPage, RouteErrorPage } from '@/pages/errors'
import { LoginPage } from '@/pages/login'

/** 路由層級的程式碼分割：頁面在第一次進入時才載入 */
const page = <M,>(load: () => Promise<M>, name: keyof M) => async () => ({ Component: (await load())[name] as React.ComponentType })

const memories = () => import('@/pages/memories')
const soon = () => import('@/pages/coming-soon')

export const routes = [
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage />, handle: { crumb: 'Dashboard' } },
      {
        path: 'memories',
        handle: { crumb: 'Memories' },
        children: [
          { index: true, lazy: page(memories, 'MemoriesPage') },
          { path: 'review', lazy: page(memories, 'MemoryReviewPage'), handle: { crumb: '待審核' } },
          { path: ':id', lazy: page(soon, 'MemoryRedirect') },
        ],
      },
      { path: 'knowledge', lazy: page(soon, 'KnowledgeGraphPage'), handle: { crumb: 'Knowledge Graph' } },
      { path: 'sources', lazy: page(() => import('@/pages/sources'), 'SourcesPage'), handle: { crumb: 'Sources' } },
      { path: 'imports', lazy: page(() => import('@/pages/imports'), 'ImportsPage'), handle: { crumb: 'Imports' } },
      { path: 'connections', lazy: page(soon, 'ConnectionsPage'), handle: { crumb: 'Connections' } },
      {
        path: 'developer',
        handle: { crumb: 'Developer' },
        children: [
          { index: true, element: <Navigate to="/developer/api" replace /> },
          { path: 'api', lazy: page(() => import('@/pages/developer-api'), 'DeveloperApiPage'), handle: { crumb: 'API' } },
          { path: 'mcp', lazy: page(soon, 'McpPage'), handle: { crumb: 'MCP' } },
          { path: 'logs', lazy: page(() => import('@/pages/developer-logs'), 'DeveloperLogsPage'), handle: { crumb: 'Logs' } },
        ],
      },
      { path: 'storage', lazy: page(() => import('@/pages/storage'), 'StoragePage'), handle: { crumb: 'Storage' } },
      { path: 'settings', lazy: page(() => import('@/pages/settings'), 'SettingsPage'), handle: { crumb: 'Settings' } },
      { path: '*', element: <NotFoundPage />, handle: { crumb: '找不到頁面' } },
    ],
  },
]

export const createRouter = () => createBrowserRouter(routes)
