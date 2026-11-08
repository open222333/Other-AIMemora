# MEMORA

> **One Memory. Every AI.** — A Universal Memory Layer for Artificial Intelligence

自架式的跨 AI 共用記憶平台：使用者擁有一份長期記憶，ChatGPT、Claude、Gemini、DeepSeek 或本地模型在授權範圍內讀取與更新它。

**使用教學**：[frontend/src/content/user-guide.md](frontend/src/content/user-guide.md)，也可在 Web UI 閱讀（登入頁「查看使用教學」→ `/guide`，登入後側欄「使用教學」→ `/help`）。

目前進度：**Phase 1（MVP：核心記憶系統）**，並先提供 Phase 2 的 API Key 存取。產品規格見 [docs/MEMORA_UI_UX_產品規劃與開發規格.md](docs/MEMORA_UI_UX_產品規劃與開發規格.md)。

## 目錄

- [快速開始（Docker Compose）](#快速開始docker-compose)
- [專案結構](#專案結構)
- [本機開發](#本機開發)
- [功能與 API](#功能與-api)
- [權限模型](#權限模型)
- [搜尋](#搜尋)
- [資料與安全](#資料與安全)
- [開發進度](#開發進度)

## 快速開始（Docker Compose）

```bash
cp .env.example .env
# 修改 POSTGRES_PASSWORD、MEMORA_SECRET_KEY（openssl rand -base64 32）、MEMORA_ADMIN_PASSWORD
docker compose up -d --build
```

- Web UI：<http://localhost:8080>（只綁定 127.0.0.1）
- API 文件：<http://localhost:8080/api/docs>
- `MEMORA_ADMIN_PASSWORD` 留空時，初始密碼會印在 `docker compose logs api`
- 資料存在 volume `pgdata`；備份：`docker compose exec db pg_dump -U memora memora > backup.sql`

### 疑難排解

| 症狀 | 原因與處理 |
|---|---|
| `docker compose up` 顯示 `dependency failed to start: container ... api ... is unhealthy`，或網頁出現「MEMORA API 目前無法連線」 | 執行 `docker compose logs api --tail 50` 查看原因（以 `[MEMORA]` 開頭的訊息會說明怎麼修） |
| `MEMORA_SECRET_KEY 仍是範例值` | 在 `.env` 設定 `MEMORA_SECRET_KEY=$(openssl rand -hex 32)` 的結果，再 `docker compose up -d` |
| `資料庫 migration 失敗` / `password authentication failed` | `POSTGRES_PASSWORD` 只在資料庫**第一次**建立時生效。之後要改密碼：`docker compose exec db psql -U memora -c "ALTER USER memora PASSWORD '新密碼'"`，再更新 `.env`；或在確定不需要資料時 `docker compose down -v` 重建 |
| 改了程式或 `.env` 沒生效 | 程式變更需 `docker compose up -d --build`；只改 `.env` 執行 `docker compose up -d` 即可 |

## 專案結構

```
Other-AIMemora/
├── backend/                  # Python FastAPI（Modular Monolith）
│   ├── memora/
│   │   ├── api/              # 路由：auth、memories、sources、imports、export、dashboard、system
│   │   ├── memory/           # Memory Engine：建立、更新、版本、去重、權限
│   │   ├── retrieval/        # Hybrid Search、Embedding
│   │   ├── importers/        # 匯入檔解析（Markdown / JSON / CSV / TXT）
│   │   ├── security/         # 密碼、JWT、API Key、限流
│   │   ├── models.py         # 資料表
│   │   └── main.py
│   ├── migrations/           # Alembic
│   ├── tests/                # pytest（真實 PostgreSQL + pgvector）
│   └── Dockerfile
├── frontend/                 # React + Vite + TypeScript + shadcn/ui（見 frontend/README.md）
├── docs/
├── docker-compose.yml        # db（pgvector/pg16）+ api + web（nginx）
└── .env.example
```

> 規格書建議 Next.js；因自架場景不需要 SSR，沿用既有的 Vite + shadcn/ui Dashboard 模板（同樣是 React + TypeScript + Tailwind + shadcn/ui）。

## 本機開發

需求：Python 3.12+、Node 22、PostgreSQL 16 + pgvector（或用 `docker compose up -d db` 只啟動資料庫，並在 compose 中開放 5432）。

```bash
# 後端
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
export MEMORA_DATABASE_URL=postgresql+psycopg://memora:memora@localhost:5432/memora
export MEMORA_ADMIN_PASSWORD=admin12345
alembic upgrade head
uvicorn memora.main:app --reload            # http://localhost:8000/api/docs

# 測試（會清空測試資料庫）
MEMORA_TEST_DATABASE_URL=postgresql+psycopg://memora:memora@localhost:5432/memora_test pytest
ruff check . && ruff format --check .

# 前端
cd frontend
npm install
npm run dev                                  # 預設 mock API（Demo Data），admin / admin
VITE_API_MOCK=false npm run dev              # 接本機後端（/api 轉發到 :8000）
npm test && npm run typecheck && npm run lint
```

## 功能與 API

所有端點在 `/api/v1` 之下，完整規格見 `/api/docs`（OpenAPI）。

| 頁面 | 功能 | 主要端點 |
|---|---|---|
| Dashboard | 記憶總數、有效、待審核、API Key、儲存用量、成長趨勢、最近活動、健康狀態（全部來自實際資料） | `GET /stats`、`/activity`、`/health` |
| Memories | 新增 / 編輯 / 封存 / 刪除、分類、標籤、可信度、到期日、允許讀取的 AI、批次操作、版本歷史 | `GET/POST /memories`、`GET/PATCH/DELETE /memories/{id}`、`GET /memories/{id}/versions`、`POST /memories/bulk` |
| 搜尋 | 列表篩選、Hybrid / 關鍵字 / 語意搜尋 | `POST /memories/search` |
| 待審核 | AI 寫入或匯入的記憶，核准 / 拒絕 | `POST /memories/bulk`（activate / reject） |
| Sources | 每筆記憶的來源與記憶數 | `GET /sources` |
| Imports | 上傳 → 預覽（重複偵測）→ 匯入 / 取消，錯誤報表下載 | `POST /imports`、`/imports/{id}/commit`、`/cancel`、`GET /imports/{id}/errors.csv` |
| Developer · API | API Key 建立、撤銷、輪替；端點說明 | `GET/POST /api-keys`、`/api-keys/{id}/revoke`、`/rotate` |
| Developer · Logs | 操作紀錄（不含記憶內容） | `GET /activity` |
| Storage | PostgreSQL / pgvector / Embedding 狀態、資料表大小、匯出 | `GET /storage`、`POST /storage/reindex`、`GET /export` |
| Settings | 系統名稱、語言、時區、新記憶預設可讀 AI、AI 寫入需審核、主題（存在使用者偏好） | `GET/PATCH /settings`、`PATCH /auth/me/preferences` |

Knowledge Graph、AI Connections、MCP 頁面目前標示為 Phase 2 / 3，不顯示假資料。

## 權限模型

- **UI 使用者**：登入後後端設定 session cookie（`httpOnly`、`SameSite=Strict`、`Path=/api`，網頁 JavaScript 讀不到，XSS 偷不走）；`admin` 可讀寫，`viewer` 唯讀
  - 寫入請求必須帶 `X-Requested-With: memora`（CSRF 防護），前端 client 自動加上
  - 登出清除此瀏覽器的 cookie；「登出所有裝置」與改密碼會遞增 token 版本，所有既有 session 立即失效
  - `Authorization: Bearer` 只接受 API Key，不接受 UI session token
  - 經 HTTPS 提供服務時設定 `MEMORA_COOKIE_SECURE=true`
- **API Key**（代表某個 AI，例如 `claude`）：
  - scope 分開授權：`memories:read`、`memories:write`、`memories:delete`（刪除預設不給）
  - 只看得到 **status = active** 且「允許讀取的 AI」包含它（或 `*`）的記憶，輸出前再檢查一次
  - 寫入的記憶預設進入 **待審核**（設定可關閉）；不可修改記憶狀態與權限；不可呼叫管理端點
  - 修改既有記憶時 **不會直接覆寫**：API 回 `202`，建立一筆「修改提案」（`proposal_for` 指向原記憶），使用者在「待審核」核准後才套用並產生新版本，避免被 prompt injection 的 AI 竄改共用記憶
  - 只儲存 SHA-256 雜湊，明文只在建立時顯示一次；可撤銷、輪替、設定到期；每分鐘限流（`MEMORA_RATE_LIMIT_PER_MINUTE`）
- 新記憶預設 **不開放任何 AI 讀取**（最小權限），可在設定中調整預設值

```bash
curl -X POST http://localhost:8080/api/v1/memories/search \
  -H "Authorization: Bearer mk_..." -H "Content-Type: application/json" \
  -d '{"query": "回答語言偏好", "limit": 5}'
```

## 搜尋

Hybrid Search（`retrieval/search.py`）：

1. 條件篩選：分類、標籤、狀態、權限
2. 關鍵字：`ILIKE` 子字串（精確區分 `RTX 4090` / `RTX 4080`、版本號、專有名詞）+ 標籤 + `pg_trgm` 相似度
3. 向量：pgvector cosine 距離（Embedding 啟用時）
4. RRF 融合排序（關鍵字略加權）
5. 輸出前權限再確認

Embedding 預設 **disabled**（不送出任何資料）。啟用本機 Ollama：

```bash
MEMORA_EMBEDDING_PROVIDER=openai
MEMORA_EMBEDDING_BASE_URL=http://host.docker.internal:11434/v1
MEMORA_EMBEDDING_MODEL=nomic-embed-text
```

任何 OpenAI 相容的 `/v1/embeddings` 皆可；向量記錄模型名稱與維度，換模型後到 Storage 按「補建向量」。

## 資料與安全

- 資料表：`users`、`workspaces`、`memories`、`memory_versions`、`memory_tags`、`memory_relations`、`memory_sources`、`ai_connections`、`api_keys`、`access_policies`、`embeddings`、`import_jobs`、`audit_logs`（皆含 `workspace_id`，預留多使用者）
- 每筆記憶有穩定 ID（`mem_` + ULID）；內容與版本歷史分開；每次修改產生新版本並記錄修改者與原因
- 重複偵測：正規化內容雜湊（新增、修改、匯入皆檢查）
- **刪除政策**：刪除記憶會一併刪除版本、標籤、權限、向量與針對它的待審核提案；稽核紀錄只保留 ID；已匯出的檔案與 pg_dump 備份由使用者自行管理
- 稽核紀錄只記動作、目標 ID 與 metadata，不記完整記憶內容；UI 內的搜尋不記錄，AI 的讀取與搜尋會記錄
- 登入節流：同一 IP 或帳號 5 分鐘內失敗 10 次即暫時封鎖（`MEMORA_LOGIN_MAX_FAILURES`、`MEMORA_LOGIN_WINDOW_SECONDS`），失敗登入寫入稽核紀錄；nginx 以實際連線 IP 覆寫 `X-Forwarded-For`，避免偽造
- CSV 匯出與錯誤報表會跳脫 `= + - @` 開頭的儲存格，防止公式注入
- 匯入任務在完成或取消後清除暫存原文，超過 24 小時未確認的預覽自動取消
- 密碼上限 72 bytes（bcrypt 限制，超過會拒絕而非截斷）
- 正式環境 `MEMORA_SECRET_KEY` 未設定或過短時拒絕啟動；服務預設只綁定 127.0.0.1，遠端存取請自行加上 TLS 與防護

### 已知限制（待處理）

- nginx 尚未加上 CSP 等安全標頭；`/api/docs` 為公開
- 限流與登入節流在單一程序記憶體內，多 worker 部署需改用 Redis
- 依賴套件使用 `>=` 版本範圍，正式部署建議鎖定版本

## 開發進度

| Phase | 內容 | 狀態 |
|---|---|---|
| 1 MVP | Dashboard、Memories CRUD、搜尋、來源、PostgreSQL + pgvector、主題、Docker Compose、匯入 / 匯出、認證與權限 | ✅ |
| 2 AI 整合 | API Key 與權限 ✅、待審核流程 ✅、MCP Server、AI 連線管理、對話擷取（Extraction） | 進行中 |
| 3 智慧記憶 | Knowledge Graph、衝突偵測、自動去重 / 合併、智慧摘要、過期策略 | 規劃中 |
| 4 Developer Platform | Webhooks、進階 Logs、多使用者與團隊、自動備份還原、監控 | 規劃中 |
