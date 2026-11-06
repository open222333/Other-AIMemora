import { isRouteErrorResponse, Link, useRouteError } from 'react-router'

import { Button } from '@/components/ui/button'

function ErrorLayout({ code, title, detail }: { code: string; title: string; detail?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="text-muted-foreground text-5xl font-bold">{code}</div>
      <h1 className="text-xl font-semibold">{title}</h1>
      {detail && <p className="text-muted-foreground max-w-md text-sm">{detail}</p>}
      <Button asChild variant="outline">
        <Link to="/dashboard">回到總覽</Link>
      </Button>
    </div>
  )
}

export function NotFoundPage() {
  return <ErrorLayout code="404" title="找不到頁面" detail="網址可能有誤，或頁面已被移除。" />
}

/** 路由層級的錯誤邊界（render 例外、lazy 載入失敗） */
export function RouteErrorPage() {
  const error = useRouteError()
  if (isRouteErrorResponse(error)) return <ErrorLayout code={String(error.status)} title={error.statusText} />
  return (
    <ErrorLayout
      code="Oops"
      title="頁面發生錯誤"
      detail={error instanceof Error ? error.message : '未知錯誤，請重新整理頁面'}
    />
  )
}
