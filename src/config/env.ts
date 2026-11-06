/** 環境變數（.env / .env.development / .env.production，VITE_ 前綴才會進前端） */
export const env = {
  appName: import.meta.env.VITE_APP_NAME || 'Dashboard',
  /** API 前綴；開發時由 Vite proxy 轉到後端，正式環境由 nginx 轉發 */
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, ''),
  /** true = 使用前端內建的 mock API（不需後端） */
  apiMock: import.meta.env.VITE_API_MOCK === 'true',
  apiTimeoutMs: Number(import.meta.env.VITE_API_TIMEOUT_MS || 15000),
}
