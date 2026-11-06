import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'

import { configureClient } from '@/api/client'
import { createMockTransport } from '@/api/mock'
import { ThemeProvider } from '@/components/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { createQueryClient } from '@/lib/query'
import { routes } from '@/router'
import { useAuth } from '@/features/auth/store'

/** 以 mock API（無延遲）渲染整個 App 於指定路徑 */
export function renderApp(path: string) {
  configureClient({
    transport: createMockTransport({ latencyMs: 0 }),
    getToken: () => useAuth.getState().token,
    onUnauthorized: () => useAuth.getState().clear(),
  })
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const qc = createQueryClient()
  qc.setDefaultOptions({ queries: { ...qc.getDefaultOptions().queries, retry: false } })
  const utils = render(
    <ThemeProvider>
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  )
  return { ...utils, router }
}
