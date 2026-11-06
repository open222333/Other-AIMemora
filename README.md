# Template-ReactDashboard

```
React 後台 Dashboard 模板
React + Vite + TypeScript + shadcn/ui：側欄 + 路由 + 資料表格 + API client，內建 mock API，不需後端即可開發
```

適用：管理後台、內部工具、SaaS Dashboard（例如 MEMORA 前端、Template-PythonFlaskAPI / Template-PythonVectorAPI 的管理介面）。

測試環境：Node 22

## 目錄

- [功能](#功能)
- [技術組合](#技術組合)
- [目錄結構](#目錄結構)
- [基於此模板建立新專案](#基於此模板建立新專案)
- [本機執行](#本機執行)
- [環境變數](#環境變數)
- [串接後端](#串接後端)
- [新增頁面](#新增頁面)
- [新增資源（CRUD）](#新增資源crud)
- [資料表格](#資料表格)
- [登入與權限](#登入與權限)
- [Docker](#docker)
- [注意事項](#注意事項)

## 功能

- **版面**：可收合側欄（狀態記憶）、手機版抽屜選單、頂欄麵包屑、⌘K 指令面板、淺色 / 深色 / 跟隨系統
- **路由**：React Router（data router），未登入自動導向登入頁並帶回原網址，路由錯誤邊界、404
- **API client**：自動帶 token、query string、逾時、錯誤訊息統一轉換、401 自動登出
- **後端格式轉換集中在一個檔案**：同時相容 FastAPI（`access_token`、`detail`）與 Template-PythonFlaskAPI（`token`、`message`）
- **Mock API**：`VITE_API_MOCK=true` 時前端內建假後端（登入、統計、專案 CRUD、權限），正式 build 完全不含 mock 程式碼
- **資料表格**：伺服器端分頁 / 排序 / 搜尋 / 多選篩選，**狀態同步到網址**；勾選批次刪除、欄位顯示設定、骨架載入、空狀態、錯誤重試
- **CRUD 範例**：專案列表 + 右側詳細面板（Inspector）+ 新增 / 編輯表單（react-hook-form + Zod，後端 422 錯誤回填欄位）+ 刪除確認
- **權限**：依角色隱藏導覽項目與操作按鈕（viewer 唯讀）
- **頁面**：登入、總覽（統計卡片、最近活動）、專案、設定、404

## 技術組合

| 用途 | 套件 |
|---|---|
| 建置 | Vite、TypeScript |
| UI | shadcn/ui（Radix）、Tailwind CSS v4、lucide-react、sonner |
| 路由 | react-router v7 |
| 伺服器狀態 | @tanstack/react-query v5 |
| 表格 | @tanstack/react-table v8 |
| 表單 | react-hook-form + zod v4 |
| 用戶端狀態 | zustand（登入、側欄） |
| 測試 | Vitest、Testing Library、jsdom |

## 目錄結構

```
Template-ReactDashboard/
├── docker/
│   ├── Dockerfile                # node build → nginx
│   └── nginx.conf.template       # SPA fallback + /api 反向代理（API_UPSTREAM）
├── src/
│   ├── api/
│   │   ├── client.ts             # fetch 包裝、ApiError、configureClient()
│   │   ├── adapters.ts           # ★ 後端回應格式轉換（串接後端只改這裡）
│   │   ├── types.ts              # Paginated、ListParams、User、Session
│   │   └── mock/                 # mock 後端：router、db（假資料）、路由定義
│   ├── config/
│   │   ├── env.ts                # VITE_* 環境變數
│   │   └── nav.ts                # ★ 側欄導覽設定
│   ├── features/                 # 依功能分：api（React Query hooks）、schema、元件
│   │   ├── auth/                 # 登入 API、auth store、hasRole()
│   │   ├── dashboard/
│   │   └── projects/             # CRUD 範例：schema、api、表單、詳細面板、badge
│   ├── pages/                    # 路由頁面
│   ├── components/
│   │   ├── ui/                   # shadcn/ui 元件
│   │   ├── layout/               # AppLayout、Sidebar、Topbar、CommandMenu
│   │   ├── data-table/           # DataTable、分頁、排序標題、篩選、欄位設定、勾選欄
│   │   └── common/               # PageHeader、Empty / Error 狀態、ConfirmDialog
│   ├── hooks/                    # useListParams（網址同步）、useDebouncedValue、useHotkeys
│   ├── lib/                      # QueryClient、bootstrap、format、cn
│   ├── router.tsx                # ★ 路由
│   ├── __tests__/
│   └── test/                     # 測試 setup、renderApp()
├── .env.development              # npm run dev 用（預設 mock）
├── .env.production               # npm run build 用
├── components.json               # shadcn CLI 設定
├── docker-compose.yml
└── vite.config.ts                # @ 別名、/api dev proxy、Vitest
```

## 基於此模板建立新專案

```bash
git clone <此模板 URL> your-new-project
cd your-new-project
rm -rf .git && git init          # 不保留模板歷史
npm install
```

- 修改 `package.json` 的 `name`、`.env.*` 的 `VITE_APP_NAME`
- 修改 `src/features/auth/store.ts`、`src/components/layout/ui-store.ts` 的 persist `name`（localStorage key），避免與其他專案衝突
- 用不到的範例：刪除 `features/projects/`、`pages/projects.tsx`，並從 `router.tsx`、`config/nav.ts`、`api/mock/index.ts` 移除

## 本機執行

```bash
npm install
npm run dev          # http://localhost:5173，mock 模式帳號 admin / admin（viewer / viewer 為唯讀）
npm test             # Vitest
npm run typecheck
npm run lint         # oxlint
npm run build        # 輸出 dist/
```

## 環境變數

`VITE_` 開頭的變數會**寫進前端 bundle**，不可放任何機密。

| 變數 | 說明 | 開發預設 | 正式預設 |
|---|---|---|---|
| `VITE_APP_NAME` | 側欄與登入頁顯示名稱 | `Dashboard` | `Dashboard` |
| `VITE_API_BASE_URL` | API 前綴 | `/api/v1` | `/api/v1` |
| `VITE_API_MOCK` | `true` = 使用前端 mock API | `true` | `false` |
| `VITE_API_TIMEOUT_MS` | 請求逾時 | `15000` | `15000` |
| `VITE_API_PROXY_TARGET` | 開發時 `/api` 轉發目標（僅 dev server） | `http://localhost:8000` | — |

本機覆寫用 `.env.development.local`（不入版控）。

## 串接後端

1. `.env.development.local`：

```bash
VITE_API_MOCK=false
VITE_API_PROXY_TARGET=http://localhost:8000
```

2. 確認後端提供以下端點（路徑不同時改 `features/*/api.ts`）：

| 方法 | 路徑 | 回應 |
|---|---|---|
| `POST` | `/auth/login` | `{ access_token, user }` 或 `{ token, role }` |
| `GET` | `/auth/me` | `{ id, username, name, email, role }` |
| `GET` | `/projects?page=&page_size=&q=&sort=&order=&status=` | `{ items, total, page, page_size }` |
| `GET` / `PATCH` / `DELETE` | `/projects/{id}` | 專案物件 / 204 |
| `POST` | `/projects`、`/projects/bulk-delete` | 專案物件 / `{ deleted }` |
| `GET` | `/stats`、`/activity` | 總覽頁資料 |

3. 回應格式不同時改 `src/api/adapters.ts`：

| 函式 | 用途 |
|---|---|
| `toListQuery()` | 列表參數 → query string（例如改成 `limit` / `offset`） |
| `toPaginated()` | 列表回應 → `{ items, total, page, pageSize }` |
| `toSession()` / `toUser()` | 登入、使用者資料 |
| `toErrorMessage()` | 錯誤回應 → 顯示文字（支援 FastAPI 422 驗證錯誤陣列） |

串接 Template-PythonFlaskAPI：`VITE_API_BASE_URL` 依其路由前綴調整（例如 `/`），登入回應 `{token, role}` 已相容；其 `/auth/me` 不存在時，移除 `components/layout/app-layout.tsx` 中的 `me` 查詢即可。

## 新增頁面

1. `src/pages/` 建立頁面元件
2. `src/router.tsx` 加路由，`handle: { crumb: '名稱' }` 會顯示在麵包屑
3. `src/config/nav.ts` 加側欄項目（`roles` 可限定角色）

## 新增資源（CRUD）

以 `features/projects/` 為範本：

| 檔案 | 內容 |
|---|---|
| `schema.ts` | Zod 表單 schema、型別、選項顯示文字 |
| `api.ts` | query key、`useXxx` / `useSaveXxx` / `useDeleteXxx`（成功後自動 invalidate 與 toast） |
| `*-form-dialog.tsx` | 新增 / 編輯表單 |
| `*-detail-sheet.tsx` | 右側詳細面板 |
| `pages/*.tsx` | 欄位定義 + DataTable + 工具列 |
| `api/mock/index.ts` | mock 端點（開發用，可選） |

## 資料表格

```tsx
const { params, update, setExtra } = useListParams({ sort: 'updated_at', filters: ['status'] })
const query = useProjects(params)

<DataTable
  tableId="projects"                     // 欄位顯示設定的儲存 key
  columns={columns}
  data={query.data?.items}
  total={query.data?.total ?? 0}
  params={params}
  onParamsChange={update}                // 排序、換頁 → 更新網址 → 重新查詢
  getRowId={(r) => r.id}
  isLoading={query.isLoading}
  isFetching={query.isFetching}
  error={query.error}
  onRowClick={(r) => setExtra('selected', r.id)}
  toolbar={(table) => <ViewOptions table={table} />}
/>
```

- 網址範例：`/projects?q=api&status=active,paused&sort=name&order=asc&page=2&selected=prj_0017`
- 除換頁外的任何變更都回到第 1 頁；篩選或換頁後清除勾選，避免誤刪畫面外的資料
- 欄位：`ColumnHeader`（排序）、`selectionColumn()`（勾選）、`meta.label`（欄位設定選單顯示名稱）
- 篩選：`FacetedFilter`（多選，值以逗號分隔）

## 登入與權限

- token 存在 `localStorage`（`dashboard:auth`）；請求自動帶 `Authorization: Bearer`
- 任何請求回 401 → 清除登入狀態並導向 `/login?redirect=...&expired=1`
- 登入後只會導向站內相對路徑（防 open redirect）
- `hasRole(user, 'admin', 'operator')` 控制按鈕顯示；`nav.ts` 的 `roles` 控制選單
- **前端權限只是 UI**，後端仍必須檢查權限

## Docker

```bash
docker compose up -d --build                                  # http://localhost:8080，/api 轉到主機 8000
API_UPSTREAM=http://api:8000 docker compose up -d --build     # 與後端在同一個 compose
VITE_API_MOCK=true docker compose up -d --build               # 沒有後端，以 mock 展示
```

- `VITE_*` 是**建置參數**（改了要重新 build）；`API_UPSTREAM` 是執行時環境變數
- nginx 以 `/etc/nginx/templates/` 機制在啟動時替換 `${API_UPSTREAM}`

## 注意事項

- 安全性較高的做法是後端改用 httpOnly cookie：移除 auth store 的 token，client 改用 `credentials: 'include'`
- 主 bundle 約 790 KB（gzip 約 240 KB）；頁面變多時可用 React Router 的 `lazy` 拆分路由
- `src/components/ui/` 可用 `npx shadcn@latest add <元件>` 新增；`react-hooks/incompatible-library` 對 TanStack Table 的警告已在 `data-table.tsx` 註明忽略
