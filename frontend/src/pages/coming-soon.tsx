import { Construction } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router'

import { PageHeader } from '@/components/common/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface Props {
  title: string
  description: string
  phase: string
  points: string[]
  meanwhile?: { label: string; to: string }
}

/** 尚未實作的模組：明確標示規劃階段，不顯示假資料 */
export function ComingSoonPage({ title, description, phase, points, meanwhile }: Props) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <Construction className="text-muted-foreground size-8" />
          <Badge variant="secondary">{phase}</Badge>
          <ul className="text-muted-foreground flex max-w-md flex-col gap-1 text-sm">
            {points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          {meanwhile && (
            <Button variant="outline" asChild>
              <Link to={meanwhile.to}>{meanwhile.label}</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </>
  )
}

export const KnowledgeGraphPage = () => (
  <ComingSoonPage
    title="知識圖譜"
    description="以節點與關聯線呈現記憶之間的關係"
    phase="Phase 3 · 智慧記憶"
    points={['依分類呈現節點、顯示關聯強度與類型', '依專案、標籤、來源篩選；縮放、拖曳、搜尋', '資料表 memory_relations 已預先建立']}
    meanwhile={{ label: '先用標籤整理記憶', to: '/memories' }}
  />
)

export const ConnectionsPage = () => (
  <ComingSoonPage
    title="AI 連線"
    description="ChatGPT、Claude、Gemini、DeepSeek、Ollama 的連線與權限"
    phase="Phase 2 · AI 整合"
    points={[
      '每個連線可設定讀取 / 新增 / 修改 / 刪除權限與可存取分類',
      '連線狀態與記憶同步狀態分開顯示',
      '現在就能用 API Key 讓 AI 透過 REST API 存取記憶',
    ]}
    meanwhile={{ label: '建立 API Key', to: '/developer/api' }}
  />
)

export const McpPage = () => (
  <ComingSoonPage
    title="MCP Server"
    description="讓支援 MCP 的 AI 客戶端直接讀寫記憶"
    phase="Phase 2 · AI 整合"
    points={[
      '工具：search_memories、get_memory、create_memory、update_memory、delete_memory',
      'get_user_context、get_project_context',
      '沿用 API Key 的 scope 與 visibility 權限，刪除需額外授權',
    ]}
    meanwhile={{ label: '查看 REST API', to: '/developer/api' }}
  />
)

/** /memories/:id → 記憶列表並開啟 Inspector */
export function MemoryRedirect() {
  const { id } = useParams()
  return <Navigate to={`/memories?selected=${encodeURIComponent(id ?? '')}`} replace />
}
