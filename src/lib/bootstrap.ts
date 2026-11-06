/** 啟動設定：把 API client 接上登入狀態與 mock transport */
import { configureClient } from '@/api/client'
import { useAuth } from '@/features/auth/store'

export async function bootstrap() {
  configureClient({
    getToken: () => useAuth.getState().token,
    onUnauthorized: () => {
      if (!useAuth.getState().token) return
      useAuth.getState().clear()
      const here = window.location.pathname + window.location.search
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign(`/login?redirect=${encodeURIComponent(here)}&expired=1`)
      }
    },
  })
  // 直接比對 import.meta.env 讓正式 build 完全移除 mock 程式碼
  if (import.meta.env.VITE_API_MOCK === 'true') {
    const { createMockTransport } = await import('@/api/mock') // 正式 build 未啟用時不載入
    configureClient({ transport: createMockTransport() })
    console.info('[mock] 使用前端 mock API，登入帳號 admin / admin')
  }
}
