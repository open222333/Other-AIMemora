/** 稽核紀錄的動作名稱 → 顯示文字 */
const ACTION_LABEL: Record<string, string> = {
  'memory.create': '新增了記憶',
  'memory.update': '修改了記憶',
  'memory.delete': '刪除了記憶',
  'memory.read': '讀取了記憶',
  'memory.search': '搜尋了記憶',
  'memory.bulk_create': '批次新增記憶',
  'memory.bulk_delete': '批次刪除記憶',
  'memory.bulk_archive': '批次封存記憶',
  'memory.bulk_activate': '核准了記憶',
  'memory.bulk_reject': '拒絕了記憶',
  'memory.bulk_set_category': '批次變更分類',
  'memory.bulk_add_tags': '批次加上標籤',
  'import.upload': '上傳了匯入檔',
  'import.commit': '完成匯入',
  'import.cancel': '取消匯入',
  'data.export': '匯出了資料',
  'api_key.create': '建立了 API Key',
  'api_key.revoke': '撤銷了 API Key',
  'api_key.rotate': '輪替了 API Key',
  'settings.update': '更新了設定',
  'storage.reindex': '重建了向量索引',
  'user.password_change': '變更了密碼',
}

export const actionLabel = (a: string) => ACTION_LABEL[a] ?? a

export const actorLabel = (type: string, name: string) => (type === 'api_key' ? `API Key · ${name}` : name)
