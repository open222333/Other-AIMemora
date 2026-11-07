# MEMORA --- 產品規劃與 UI/UX 開發規格

> **產品定位：** Personal AI Memory Platform\
> **品牌標語：** One Memory. Every AI.\
> **文件版本：** v1.0\
> **規劃日期：** 2026-11-05\
> **部署模式：** Self-hosted（自架式）\
> **目標使用者：** 個人使用者與開發者\
> **介面主題：** Light / Dark / System

------------------------------------------------------------------------

## 1. 產品願景與定位

MEMORA 是一套獨立的跨 AI 共用記憶平台，讓
ChatGPT、Claude、Gemini、DeepSeek，以及本地或相容 API
的模型，能在使用者授權下讀取及更新同一份長期記憶。

MEMORA 不應只是聊天紀錄備份工具，也不應綁定單一 AI
廠商。它應成為位於不同 AI 服務之間的 **Universal Memory Layer**。

### 核心原則

1.  使用者擁有記憶資料及最終控制權。
2.  不同 AI 可以在授權範圍內共享同一份記憶。
3.  AI 提出的記憶更新應經過規則檢查，重要內容可要求使用者審核。
4.  每筆記憶都應保留來源、建立時間、更新時間及版本紀錄。
5.  記憶讀取、寫入、修改、刪除權限應分開管理。
6.  支援資料匯出、備份、還原及刪除。
7.  核心資料與 API 不依賴特定 AI 廠商。
8.  自架部署時，預設不將資料傳送至外部服務；外部模型或 Embedding
    服務須由使用者自行設定及授權。

### 品牌方向

-   品牌名稱：MEMORA
-   標語：One Memory. Every AI.
-   產品描述：A Universal Memory Layer for Artificial Intelligence
-   視覺方向：現代 SaaS、深色科技風、紫藍色主色、簡潔資訊層級。

------------------------------------------------------------------------

## 2. 目標使用者與使用模式

### 個人使用者

-   查看、搜尋及整理長期記憶。
-   手動新增或修正個人偏好、專案資訊及知識。
-   匯入 AI 對話資料。
-   控制哪些 AI 可以讀取特定記憶。
-   查看記憶來源及修改歷史。

### 開發者

-   管理 REST API Key。
-   設定 MCP Server。
-   查看 API 請求日誌及錯誤。
-   管理模型連線與存取權限。
-   使用 Webhook、匯入工具及自動化流程。
-   檢查資料庫、向量索引及系統健康狀態。

### 建議產品模式

採用「一般模式 + Advanced 開發者功能」：

-   一般模式：優先呈現記憶、搜尋、來源、AI 連線及基本設定。
-   開發者模式：額外顯示
    API、MCP、Logs、Webhooks、Embedding、資料庫與進階權限。

初期可先以單一使用者自架為主，但資料模型預留多使用者與團隊空間。

------------------------------------------------------------------------

## 3. UI/UX 視覺規範

### 3.1 介面風格

採用現代 SaaS Dashboard：

-   左側固定導覽列。
-   中央主要工作區。
-   需要時使用右側詳細資訊面板。
-   表格、卡片、搜尋與篩選器保持一致。
-   避免把所有系統資訊都塞進首頁。
-   桌面優先，同時支援平板及手機基本操作。

### 3.2 主題模式

支援三種模式：

-   Light：淺色。
-   Dark：深色。
-   System：跟隨作業系統。

主題設定應保存於使用者偏好，並使用統一 Design
Tokens，避免每個頁面自行定義顏色。

建議色彩：

  Token            Dark Theme   Light Theme
  ---------------- ------------ -------------
  Background       `#151923`    `#F6F7FB`
  Surface          `#202738`    `#FFFFFF`
  Primary          `#7666E8`    `#7666E8`
  Text Primary     `#F4F6FC`    `#202638`
  Text Secondary   `#AAB5C9`    `#626D82`
  Border           `#343B4D`    `#E4E7EF`

顏色應集中管理，確保深淺色切換時對比度與可讀性足夠。

### 3.3 主要版面

建議桌面版採三區架構：

1.  左側 Sidebar：主要導覽。
2.  中央 Content：目前頁面內容。
3.  右側 Inspector：選取記憶、來源或連線時顯示詳細資訊。

右側 Inspector 可收合，避免小螢幕空間不足。

------------------------------------------------------------------------

## 4. 導覽列與頁面架構

### 4.1 主要導覽

  區域           頁面              主要用途
  -------------- ----------------- ------------------
  Workspace      Dashboard         系統總覽
  Workspace      Memories          記憶管理
  Workspace      Knowledge Graph   知識關聯圖
  Data           Sources           記憶來源
  Data           Imports           對話及檔案匯入
  AI Ecosystem   Connections       AI 連線管理
  Developer      API               REST API 管理
  Developer      MCP               MCP Server 管理
  Developer      Logs              API 與系統日誌
  System         Storage           儲存與資料庫管理
  System         Settings          系統設定

### 4.2 建議 URL

  URL                  頁面
  -------------------- --------------
  `/dashboard`         總覽
  `/memories`          記憶列表
  `/memories/:id`      記憶詳細資訊
  `/memories/review`   待審核記憶
  `/knowledge`         知識圖譜
  `/sources`           資料來源
  `/imports`           匯入任務
  `/connections`       AI 連線
  `/developer/api`     API 管理
  `/developer/mcp`     MCP 設定
  `/developer/logs`    請求日誌
  `/storage`           儲存管理
  `/settings`          系統設定

------------------------------------------------------------------------

## 5. 頁面功能規格

### 5.1 Dashboard --- 總覽

首頁目標是讓使用者快速了解記憶系統是否正常運作。

建議顯示：

-   Total Memories：記憶總數。
-   Active Memories：有效記憶數。
-   Pending Review：待審核記憶數。
-   AI Connections：已設定的 AI 連線數。
-   Storage Usage：資料儲存使用量。
-   Memory Growth：記憶成長趨勢。
-   Recent Activity：最近活動。
-   Connection Health：各 AI 連線狀態。
-   API Health：API 健康狀態。

快速操作：

-   Add Memory
-   Import Conversations
-   Connect AI
-   Search Memories
-   Open API Docs

注意：Dashboard
的統計數字必須來自實際資料，不可使用假資料冒充線上狀態。開發階段可使用明確標示的
Demo Data。

### 5.2 Memories --- 記憶管理中心

這是產品最核心的頁面。

建議採用「可搜尋表格 + 詳細資訊側欄」：

主要功能：

-   新增、檢視、編輯、封存及刪除記憶。
-   關鍵字搜尋及語意搜尋。
-   分類、標籤、來源、狀態篩選。
-   批次操作。
-   合併重複記憶。
-   設定有效期限或到期策略。
-   查看版本歷史。
-   指定允許讀取的 AI。
-   查看記憶被哪些 AI 使用過。

建議分類：

  分類          範例
  ------------- ----------------------
  Profile       使用者背景與基本資訊
  Preferences   語言、回答風格、偏好
  Projects      長期進行中的專案
  Knowledge     長期知識及事實
  Decisions     已確認的決策
  Technical     技術設定與環境資訊
  Temporary     短期或暫時性資訊

每筆記憶建議欄位：

-   ID
-   Content
-   Category
-   Tags
-   Source
-   Confidence
-   Status
-   Visibility / Access Policy
-   Created At
-   Updated At
-   Last Accessed
-   Expiration / Review Date（選用）

範例 JSON：

``` json
{
  "id": "mem_000001",
  "content": "偏好使用繁體中文回答",
  "category": "preferences",
  "source": "chatgpt",
  "confidence": 0.99,
  "status": "active",
  "tags": ["language", "communication"],
  "visibility": ["chatgpt", "claude", "gemini"],
  "created_at": "2026-11-05T10:00:00Z",
  "updated_at": "2026-11-05T10:00:00Z"
}
```

以上為示意資料結構；正式 Schema
應將來源、版本、權限及向量資料正規化，不應把所有資訊都塞在單一 JSON
欄位。

### 5.3 Knowledge Graph --- 知識關聯圖

使用者可以透過節點了解記憶之間的關係。

功能：

-   顯示記憶節點及關聯線。
-   節點依分類呈現。
-   點選節點查看詳細記憶。
-   顯示關聯強度及關聯類型。
-   依專案、標籤、來源篩選。
-   可縮放、拖曳及搜尋節點。

技術可採 React Flow 或 Cytoscape.js。

### 5.4 Sources --- 記憶來源

管理記憶的原始來源：

-   ChatGPT 對話匯入。
-   Claude 對話匯入。
-   Gemini 對話匯入。
-   手動新增。
-   REST API 寫入。
-   MCP 寫入。
-   Markdown、JSON、CSV 等檔案匯入。

每筆記憶應能追溯至原始來源；若來源已刪除或無法存取，應明確顯示。

重要限制：不可假設所有 AI 平台都提供任意讀取完整歷史對話的
API。應依各平台實際支援方式，提供 API、使用者匯出檔案及 MCP
等不同整合方式。

### 5.5 Imports --- 資料匯入

功能：

-   上傳檔案。
-   選擇來源平台。
-   預覽解析結果。
-   顯示匯入筆數及錯誤。
-   重複資料偵測。
-   匯入前預覽與確認。
-   匯入工作進度及歷史紀錄。

匯入流程應支援取消、重試及錯誤下載，避免大量資料匯入失敗後無法追蹤。

### 5.6 AI Connections --- AI 連線中心

首批整合目標：

-   ChatGPT / OpenAI-compatible API
-   Claude
-   Gemini
-   DeepSeek
-   Ollama / Local LLM

每個連線可設定：

-   連線名稱及平台類型。
-   Endpoint（適用時）。
-   API Key 或認證方式。
-   連線測試。
-   是否允許讀取記憶。
-   是否允許新增記憶。
-   是否允許修改記憶。
-   是否允許刪除記憶。
-   可存取的記憶分類或範圍。
-   單次檢索數量限制。

**連線狀態與記憶同步狀態必須分開顯示。** MCP
連線成功不代表歷史對話已自動匯入。

### 5.7 Developer --- API & MCP

#### REST API

建議初期端點：

``` http
POST   /api/v1/memories
GET    /api/v1/memories
GET    /api/v1/memories/{id}
PATCH  /api/v1/memories/{id}
DELETE /api/v1/memories/{id}

POST   /api/v1/memories/search
POST   /api/v1/memories/bulk

GET    /api/v1/sources
GET    /api/v1/health
```

API 功能：

-   API Key 建立、撤銷及輪替。
-   Scope 權限管理。
-   Rate Limit。
-   請求統計。
-   錯誤日誌。
-   API 文件及範例。

#### MCP Server

建議提供工具：

  Tool                    功能
  ----------------------- --------------------
  `search_memories`       搜尋相關記憶
  `get_memory`            取得指定記憶
  `create_memory`         新增記憶
  `update_memory`         修改記憶
  `delete_memory`         刪除記憶
  `get_user_context`      取得使用者背景摘要
  `get_project_context`   取得指定專案背景

安全原則：

-   讀取與寫入權限分離。
-   刪除操作預設要求額外授權。
-   每個工具都要檢查呼叫者權限。
-   記錄呼叫者、時間、工具及結果。
-   不可將 API Key 或內部密鑰回傳給模型。

### 5.8 Storage --- 儲存管理

顯示：

-   PostgreSQL 連線狀態。
-   pgvector 狀態。
-   記憶及向量資料數量。
-   Embedding 模型資訊。
-   Index 狀態。
-   磁碟使用量。
-   備份狀態及最近備份時間。
-   匯出、還原及資料清理操作。

資料庫密碼與敏感連線資訊不可明文顯示。

### 5.9 Settings --- 系統設定

  分類            功能
  --------------- -----------------------
  General         系統名稱、語言、時區
  Appearance      Light、Dark、System
  Memory Rules    記憶提取及更新規則
  Privacy         資料存取政策
  Security        認證、Token、加密
  Backup          自動備份及還原
  Notifications   系統通知
  Advanced        Embedding、模型、快取

------------------------------------------------------------------------

## 6. Memory Lifecycle --- 記憶生命週期

建議流程：

1.  對話或使用者輸入。
2.  Memory Extraction：擷取可能有價值的資訊。
3.  Normalization：統一格式及分類。
4.  Deduplication：重複資料檢查。
5.  Conflict Detection：檢查與既有記憶是否衝突。
6.  Review：依規則自動通過或等待使用者審核。
7.  Active Memory：正式成為可檢索記憶。
8.  Retrieval：依 AI 權限提供相關記憶。
9.  Update / Archive：更新版本或封存。

### 記憶狀態

建議至少有：

-   `pending`：待審核。
-   `active`：有效且可檢索。
-   `archived`：已封存。
-   `rejected`：已拒絕。
-   `expired`：已過期。
-   `conflicted`：存在尚未解決的衝突。

### 記憶衝突處理

例如：

-   舊記憶：使用者主要使用 Claude。
-   新記憶：使用者改用 Gemini。

不應直接覆蓋或刪除舊記憶。應建立版本及關係，保存：

-   舊內容。
-   新內容。
-   更新來源。
-   更新時間。
-   變更原因。
-   審核者或確認狀態。

------------------------------------------------------------------------

## 7. 技術架構

### 7.1 推薦技術選型

  模組            技術                        用途
  --------------- --------------------------- ----------------
  Frontend        Next.js + TypeScript        Web UI
  UI Components   shadcn/ui                   元件
  Styling         Tailwind CSS                樣式及主題
  Backend         Python FastAPI              REST API
  Database        PostgreSQL                  關聯資料
  Vector Search   pgvector                    語意搜尋
  Cache / Queue   Redis（選配）               快取及工作佇列
  Graph           React Flow / Cytoscape.js   知識圖譜
  MCP             Python MCP SDK              MCP Server
  Deployment      Docker Compose              自架部署

### 7.2 架構原則

初期建議使用 **Modular
Monolith（模組化單體）**，不要過早拆成大量微服務。

主要模組：

-   API Gateway
-   Authentication & Authorization
-   Memory Engine
-   Extraction Engine
-   Retrieval Engine
-   Source / Import Manager
-   AI Integration Adapters
-   MCP Server
-   Audit & Logging
-   Backup Manager

### 7.3 系統架構示意

``` text
                 MEMORA Web UI
          Next.js / TypeScript / Tailwind
                         |
                         v
                  API Gateway
          Auth / Permission / Rate Limit
                         |
             +-----------+-----------+
             |                       |
             v                       v
        Memory Engine          Integration Layer
      Extraction/Search       MCP/API/AI Adapters
             |                       |
             +-----------+-----------+
                         |
                         v
                  Data Layer
             +-----------+-----------+
             |                       |
             v                       v
        PostgreSQL              pgvector
     Users / Memories       Embeddings / Index
             |
             v
        Local Storage
     Imports / Backups / Files
```

------------------------------------------------------------------------

## 8. 資料庫 Schema 規劃

不建議只建立單一 `memories` 資料表。

建議初期至少規劃：

  Table                用途
  -------------------- ------------------------
  `users`              使用者
  `workspaces`         工作空間，預留團隊模式
  `memories`           核心記憶
  `memory_versions`    記憶版本
  `memory_tags`        標籤
  `memory_relations`   記憶關聯
  `memory_sources`     記憶來源
  `ai_connections`     AI 連線
  `api_keys`           API 金鑰
  `access_policies`    存取權限
  `embeddings`         向量資料
  `import_jobs`        匯入任務
  `audit_logs`         操作紀錄

### 資料模型注意事項

-   每筆記憶必須有穩定且不可重複的 ID。
-   記憶內容與版本歷史分開儲存。
-   記憶來源應可追溯。
-   記憶權限應可細分至分類、專案或單筆記憶。
-   Embedding 應記錄模型名稱與版本。
-   記憶刪除要定義版本、向量索引及備份的處理政策。
-   初期即預留 `workspace_id`，避免日後多使用者改造困難。

------------------------------------------------------------------------

## 9. 搜尋與檢索策略

不要只依賴 Embedding。

建議採用 Hybrid Search：

1.  PostgreSQL 條件搜尋：依分類、來源、日期、標籤及權限篩選。
2.  Full-text Search：精確詞語及專有名詞搜尋。
3.  Vector Search：語意相似度搜尋。
4.  Ranking：依相關性、可信度、時間及使用情境排序。
5.  Permission Filter：最後輸出前再次確認 AI 的存取權限。

必須特別測試數字、型號、專有名詞、版本號及技術設定，避免語意搜尋把不同型號誤認成相同內容。

------------------------------------------------------------------------

## 10. 自架部署與安全

### Docker 專案結構

``` text
memora/
├── frontend/
├── backend/
│   ├── api/
│   ├── memory/
│   ├── extraction/
│   ├── retrieval/
│   ├── integrations/
│   ├── mcp/
│   └── security/
├── database/
│   ├── migrations/
│   └── seeds/
├── workers/
├── docker/
├── docs/
├── tests/
├── docker-compose.yml
└── .env.example
```

### 安全要求

-   API Key 僅在後端使用。
-   密碼及 Token 不可明文儲存。
-   支援 Secret 加密及輪替。
-   預設採最小權限。
-   記錄重要讀取、寫入及刪除操作。
-   支援資料匯出及完整刪除。
-   提供備份與還原驗證。
-   外部 AI、Embedding 或 LLM 呼叫需明確授權。
-   不應在一般日誌中記錄完整敏感記憶內容。
-   MCP Server 應驗證呼叫來源及權限。
-   自架服務預設只在本機或內部網路提供；遠端存取需額外設定
    TLS、認證及網路防護。

------------------------------------------------------------------------

## 11. 開發階段與優先順序

### Phase 1 --- MVP：核心記憶系統

優先完成：

-   Dashboard
-   Memories CRUD
-   Memory Search
-   Memory Sources
-   PostgreSQL + pgvector
-   Light / Dark / System Theme
-   Docker Compose
-   匯入與匯出基本功能
-   基礎認證與權限

驗收目標：使用者能自架、建立、搜尋、修改、刪除及匯出記憶。

### Phase 2 --- AI 整合

-   MCP Server
-   ChatGPT / Claude / Gemini 整合方式
-   API Keys
-   AI 權限管理
-   記憶提取及審核
-   來源追蹤

驗收目標：至少一個外部 AI 客戶端能透過 MCP 或
API，在權限控制下讀取及寫入 MEMORA 記憶。

### Phase 3 --- 智慧記憶

-   Knowledge Graph
-   記憶衝突檢測
-   自動去重
-   記憶版本管理
-   智慧摘要
-   專案脈絡管理
-   記憶過期及審核策略

驗收目標：能處理重複、過期、矛盾及多來源記憶。

### Phase 4 --- Developer Platform

-   API Documentation
-   Webhooks
-   Advanced Logs
-   批次匯入工具
-   多使用者及團隊權限
-   完整備份還原
-   進階監控及維運功能

驗收目標：第三方開發者可以依文件整合 MEMORA，並能管理
API、權限及系統狀態。

------------------------------------------------------------------------

## 12. 建議的開發驗收清單

### UI/UX

-   [ ] 左側導覽列及頁面路由完成。
-   [ ] Light / Dark / System 主題完成。
-   [ ] 桌面、平板及手機基本排版完成。
-   [ ] Loading、Empty、Error、Success 狀態完整。
-   [ ] 表格搜尋、排序、篩選及分頁可用。
-   [ ] 刪除及重要權限變更有確認流程。

### Memory

-   [ ] 新增、讀取、修改、封存及刪除。
-   [ ] 記憶分類及標籤。
-   [ ] 來源追蹤。
-   [ ] 版本歷史。
-   [ ] 待審核流程。
-   [ ] 重複與衝突檢查。
-   [ ] 權限過濾。
-   [ ] 全文及語意搜尋。

### AI Integration

-   [ ] API Key 管理。
-   [ ] MCP Server 可啟動。
-   [ ] MCP Tool 權限驗證。
-   [ ] AI 讀取記憶。
-   [ ] AI 新增記憶。
-   [ ] AI 修改記憶。
-   [ ] 操作日誌。
-   [ ] 連線與同步狀態分開呈現。

### Deployment & Security

-   [ ] Docker Compose 一鍵啟動。
-   [ ] `.env.example` 完整。
-   [ ] PostgreSQL 持久化。
-   [ ] 備份及還原測試。
-   [ ] Secret 保護。
-   [ ] 權限及認證測試。
-   [ ] API Rate Limit。
-   [ ] 錯誤及稽核日誌。

------------------------------------------------------------------------

## 13. 尚待確認的產品決策

以下為目前建議預設值，正式開發前仍可調整：

  項目         建議預設
  ------------ -----------------------------------
  使用者架構   先單人，預留多使用者
  記憶來源     自動提取 + 使用者審核 + 手動新增
  首批 AI      ChatGPT、Claude、Gemini、DeepSeek
  本地模型     Ollama 作為後續擴充
  前端         Next.js + shadcn/ui
  後端         Python FastAPI
  資料庫       PostgreSQL + pgvector
  部署         Docker Compose
  搜尋         Hybrid Search
  主題         Light / Dark / System

------------------------------------------------------------------------

## 14. 最終產品方向

MEMORA 的核心競爭力不是支援多少 AI
模型，而是能否建立一套可靠、可追蹤、可控管、可攜帶的長期記憶系統。

產品開發優先順序：

1.  先讓記憶資料可靠保存。
2.  再讓記憶能被正確搜尋。
3.  建立來源、版本及權限管理。
4.  透過 MCP 與 API 連接不同 AI。
5.  最後加入自動化、知識圖譜及進階智慧記憶。

**最終目標：使用者只需要維護一份記憶，不必在每個 AI
平台重新建立自己的背景、偏好及專案脈絡。**

> MEMORA --- One Memory. Every AI.
