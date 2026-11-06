/** 路由：handle.crumb 會顯示在頂欄麵包屑。新增頁面時同步更新 config/nav.ts。 */
import { createBrowserRouter, Navigate } from 'react-router'

import { AppLayout } from '@/components/layout/app-layout'
import { DashboardPage } from '@/pages/dashboard'
import { NotFoundPage, RouteErrorPage } from '@/pages/errors'
import { LoginPage } from '@/pages/login'
import { ProjectsPage } from '@/pages/projects'
import { SettingsPage } from '@/pages/settings'

export const routes = [
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage />, handle: { crumb: '總覽' } },
      { path: 'projects', element: <ProjectsPage />, handle: { crumb: '專案' } },
      { path: 'settings', element: <SettingsPage />, handle: { crumb: '設定' } },
      { path: '*', element: <NotFoundPage />, handle: { crumb: '找不到頁面' } },
    ],
  },
]

export const createRouter = () => createBrowserRouter(routes)
