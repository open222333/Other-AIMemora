/** 使用教學的錨點與目錄解析（與 Markdown 內 [文字](#錨點) 連結的規則一致） */

export interface TocItem {
  id: string
  text: string
  level: 2 | 3
}

/** 標題文字 → 錨點 id：小寫、空白轉 -、移除標點（保留中文、英數字） */
export function slugify(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
}

/** 從 Markdown 取出 ## 與 ### 標題（略過程式碼區塊） */
export function parseToc(md: string): TocItem[] {
  const items: TocItem[] = []
  let inCode = false
  for (const line of md.split('\n')) {
    if (line.startsWith('```')) inCode = !inCode
    if (inCode) continue
    const m = /^(#{2,3})\s+(.+?)\s*$/.exec(line)
    if (m) items.push({ level: m[1].length as 2 | 3, text: m[2], id: slugify(m[2]) })
  }
  return items
}
