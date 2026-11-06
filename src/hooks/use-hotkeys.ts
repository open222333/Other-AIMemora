import { useEffect, useLayoutEffect, useRef } from 'react'

/**
 * 快捷鍵："mod+z"、"mod+shift+z"、"mod+k"（mod = macOS ⌘ / 其他 Ctrl）
 * 焦點在輸入框時不觸發（mod+k 除外）
 */
export function useHotkeys(bindings: Record<string, (e: KeyboardEvent) => void>) {
  const ref = useRef(bindings)
  useLayoutEffect(() => {
    ref.current = bindings
  })

  useEffect(() => {
    const isMac = navigator.platform.toLowerCase().includes('mac')
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey
      const combo = [mod && 'mod', e.shiftKey && 'shift', e.altKey && 'alt', e.key.toLowerCase()]
        .filter(Boolean)
        .join('+')
      const handler = ref.current[combo]
      if (!handler) return
      const target = e.target as HTMLElement
      const typing = target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      if (typing && combo !== 'mod+k') return
      e.preventDefault()
      handler(e)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
