/**
 * 使用教學：內容在 src/content/user-guide.md（單一來源），這裡負責渲染與目錄。
 * 公開頁 /guide 與登入後的 /help 共用此元件。
 */
import { Check, Copy } from 'lucide-react'
import { isValidElement, useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

import guide from '@/content/user-guide.md?raw'
import { cn } from '@/lib/utils'

import { parseToc, slugify, type TocItem } from './toc'

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children)
  return ''
}

function scrollToId(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  history.replaceState(null, '', `#${encodeURIComponent(id)}`)
}

function CodeBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false)
  const code = textOf(children).replace(/\n$/, '')
  return (
    <div className="group relative my-4">
      <pre className="bg-muted overflow-x-auto rounded-lg border p-4 text-[13px] leading-relaxed">{children}</pre>
      <button
        type="button"
        aria-label="複製程式碼"
        className="bg-card text-muted-foreground hover:text-foreground absolute top-2 right-2 rounded-md border p-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
        onClick={() =>
          navigator.clipboard?.writeText(code).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          })
        }
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  )
}

function heading(level: 1 | 2 | 3) {
  const Tag = `h${level}` as const
  const styles = {
    1: 'mb-3 text-3xl font-semibold tracking-tight',
    2: 'mt-12 mb-4 scroll-mt-20 border-b pb-2 text-2xl font-semibold tracking-tight',
    3: 'mt-8 mb-3 scroll-mt-20 text-lg font-semibold',
  }
  return function Heading({ children }: { children?: ReactNode }) {
    return (
      <Tag id={slugify(textOf(children))} className={styles[level]}>
        {children}
      </Tag>
    )
  }
}

const components: Components = {
  h1: heading(1),
  h2: heading(2),
  h3: heading(3),
  p: ({ children }) => <p className="my-3 leading-7">{children}</p>,
  ul: ({ children }) => <ul className="my-3 ml-6 list-disc space-y-1.5 leading-7">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 ml-6 list-decimal space-y-1.5 leading-7">{children}</ol>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  a: ({ href = '', children }) =>
    href.startsWith('#') ? (
      <a
        href={href}
        className="text-primary font-medium underline-offset-4 hover:underline"
        onClick={(e) => {
          e.preventDefault()
          scrollToId(decodeURIComponent(href.slice(1)))
        }}
      >
        {children}
      </a>
    ) : (
      <a href={href} target="_blank" rel="noreferrer" className="text-primary font-medium underline-offset-4 hover:underline">
        {children}
      </a>
    ),
  blockquote: ({ children }) => (
    <blockquote className="border-primary/60 bg-accent/40 my-4 rounded-r-lg border-l-4 px-4 py-1 text-sm [&_p]:my-2">{children}</blockquote>
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
  th: ({ children }) => <th className="px-3 py-2 text-left font-medium whitespace-nowrap">{children}</th>,
  td: ({ children }) => <td className="border-t px-3 py-2 align-top">{children}</td>,
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  code: ({ className, children, ...props }: ComponentProps<'code'>) =>
    className ? (
      <code className={cn('font-mono', className)} {...props}>
        {children}
      </code>
    ) : (
      <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[0.85em]">{children}</code>
    ),
  hr: () => <hr className="my-8" />,
}

/** 目錄：捲動時標示目前段落 */
function Toc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState(items[0]?.id)
  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e)
    if (!els.length || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '0px 0px -70% 0px' },
    )
    els.forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [items])

  return (
    <nav aria-label="目錄" className="text-sm">
      <div className="text-muted-foreground mb-2 text-xs font-medium">目錄</div>
      <ul className="flex flex-col gap-0.5 border-l">
        {items.map((i) => (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              onClick={(e) => {
                e.preventDefault()
                scrollToId(i.id)
              }}
              className={cn(
                '-ml-px block border-l py-1 transition-colors',
                i.level === 3 ? 'pl-6 text-xs' : 'pl-3',
                active === i.id
                  ? 'border-primary text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground border-transparent',
              )}
            >
              {i.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function UserGuide() {
  const toc = useMemo(() => parseToc(guide), [])
  const sections = useMemo(() => toc.filter((t) => t.level === 2), [toc])

  // 從帶 #錨點 的網址進入時捲到該段落
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1))
    if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }))
  }, [])

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_14rem]">
      <article className="min-w-0 max-w-3xl">
        {/* 手機與平板：章節快速跳轉 */}
        <div className="mb-6 flex flex-wrap gap-2 lg:hidden">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => scrollToId(s.id)}
              className="bg-card hover:border-primary/40 rounded-full border px-3 py-1 text-xs"
            >
              {s.text}
            </button>
          ))}
        </div>
        <Markdown remarkPlugins={[remarkGfm]} components={components}>
          {guide}
        </Markdown>
      </article>
      <aside className="hidden lg:block">
        <div className="sticky top-6 max-h-[calc(100vh-6rem)] overflow-y-auto">
          <Toc items={toc} />
        </div>
      </aside>
    </div>
  )
}

