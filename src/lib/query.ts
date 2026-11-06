import { MutationCache, QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { ApiError } from '@/api/client'

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // 4xx 不重試（權限、找不到、驗證錯誤重試也沒用）
        retry: (count, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && count < 2,
      },
    },
    mutationCache: new MutationCache({
      // mutation 失敗統一 toast；個別 mutation 設 meta: { silent: true } 可自行處理
      onError: (e, _v, _c, m) => {
        if (!m.meta?.silent) toast.error(errorMessage(e))
      },
    }),
  })
}
