import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { env } from '@/config/env'
import { login } from '@/features/auth/api'
import { useAuth } from '@/features/auth/store'
import { errorMessage } from '@/lib/query'

const schema = z.object({
  username: z.string().trim().min(1, '請輸入帳號'),
  password: z.string().min(1, '請輸入密碼'),
})

/** 只允許站內相對路徑，避免 open redirect */
function safeRedirect(target: string | null) {
  return target && target.startsWith('/') && !target.startsWith('//') ? target : '/dashboard'
}

export function LoginPage() {
  const [sp] = useSearchParams()
  const navigate = useNavigate()
  const token = useAuth((s) => s.token)
  const setSession = useAuth((s) => s.setSession)
  const redirect = safeRedirect(sp.get('redirect'))

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: env.apiMock ? { username: 'admin', password: 'admin' } : { username: '', password: '' },
  })
  const mutation = useMutation({
    meta: { silent: true },
    mutationFn: (v: z.infer<typeof schema>) => login(v.username, v.password),
    onSuccess: (session) => {
      setSession(session)
      navigate(redirect, { replace: true })
    },
  })

  if (token) return <Navigate to={redirect} replace />
  const errors = form.formState.errors

  return (
    <div className="bg-muted/40 flex min-h-full items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">登入 {env.appName}</CardTitle>
          <CardDescription>
            {sp.get('expired') ? '登入已過期，請重新登入' : env.apiMock ? 'Mock 模式：admin / admin、viewer / viewer' : '請輸入帳號密碼'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={form.handleSubmit((v) => mutation.mutate(v))} noValidate>
            <div className="flex flex-col gap-2">
              <Label htmlFor="username">帳號</Label>
              <Input id="username" autoComplete="username" aria-invalid={!!errors.username} {...form.register('username')} />
              {errors.username && <p className="text-destructive text-xs">{errors.username.message}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">密碼</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                {...form.register('password')}
              />
              {errors.password && <p className="text-destructive text-xs">{errors.password.message}</p>}
            </div>
            {mutation.error && (
              <p role="alert" className="text-destructive text-sm">
                {errorMessage(mutation.error)}
              </p>
            )}
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="animate-spin" />}
              登入
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
