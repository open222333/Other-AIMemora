/**
 * 列表狀態與網址同步（?page=2&q=abc&status=active,paused&sort=name&order=asc）
 * 好處：重新整理、分享連結、上一頁都能保留篩選條件。
 */
import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

import type { ListParams } from '@/api/types'

export interface ListParamsOptions {
  pageSize?: number
  sort?: string
  order?: 'asc' | 'desc'
  /** 允許從網址讀取的篩選欄位 */
  filters?: string[]
}

export function useListParams(opts: ListParamsOptions = {}) {
  const [sp, setSp] = useSearchParams()
  const { pageSize = 10, sort, order = 'desc', filters = [] } = opts
  const filterKey = filters.join(',')

  const params = useMemo<ListParams>(() => {
    const p: ListParams = {
      page: Number(sp.get('page')) || 1,
      pageSize: Number(sp.get('page_size')) || pageSize,
      q: sp.get('q') ?? undefined,
      sort: sp.get('sort') ?? sort,
      order: (sp.get('order') as 'asc' | 'desc') ?? order,
    }
    for (const f of filterKey ? filterKey.split(',') : []) p[f] = sp.get(f) ?? undefined
    return p
  }, [sp, pageSize, sort, order, filterKey])

  /** 更新參數；除了換頁以外的變更都回到第 1 頁 */
  const update = useCallback(
    (patch: Partial<ListParams>) => {
      setSp(
        (prev) => {
          const next = new URLSearchParams(prev)
          const resetPage = !('page' in patch)
          for (const [k, v] of Object.entries(patch)) {
            const key = k === 'pageSize' ? 'page_size' : k
            if (v === undefined || v === '' || v === null) next.delete(key)
            else next.set(key, String(v))
          }
          if (resetPage) next.delete('page')
          return next
        },
        { replace: true },
      )
    },
    [setSp],
  )

  /** 開啟 / 關閉詳細面板等額外的網址參數 */
  const setExtra = useCallback(
    (key: string, value: string | null) =>
      setSp((prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      }),
    [setSp],
  )

  return { params, update, searchParams: sp, setExtra }
}
