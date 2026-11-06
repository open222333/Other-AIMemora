import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'

import { ApiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { errorMessage } from '@/lib/query'

import { useSaveProject } from './api'
import {
  emptyProject,
  PRIORITY_LABEL,
  PROJECT_PRIORITY,
  PROJECT_STATUS,
  projectInput,
  STATUS_LABEL,
  type Project,
  type ProjectInput,
} from './schema'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 有值 = 編輯，否則新增 */
  project?: Project | null
}

/** 後端 422 驗證錯誤（FastAPI detail 陣列）對應回表單欄位 */
function applyServerErrors(e: unknown, setError: (name: keyof ProjectInput, err: { message: string }) => void): boolean {
  if (!(e instanceof ApiError) || e.status !== 422) return false
  const detail = (e.body as { detail?: { loc?: string[]; msg?: string }[] })?.detail
  if (!Array.isArray(detail)) return false
  let applied = false
  for (const d of detail) {
    const field = d.loc?.at(-1) as keyof ProjectInput | undefined
    if (field && field in emptyProject) {
      setError(field, { message: d.msg ?? '格式錯誤' })
      applied = true
    }
  }
  return applied
}

export function ProjectFormDialog({ open, onOpenChange, project }: Props) {
  const save = useSaveProject()
  const form = useForm<ProjectInput>({ resolver: zodResolver(projectInput), defaultValues: emptyProject })
  const { errors } = form.formState

  useEffect(() => {
    if (open) {
      form.reset(project ? projectInput.parse({ ...emptyProject, ...project }) : emptyProject)
      save.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project])

  const onSubmit = form.handleSubmit((data) =>
    save.mutate(
      { id: project?.id, data },
      {
        onSuccess: () => onOpenChange(false),
        onError: (e) => applyServerErrors(e, form.setError),
      },
    ),
  )
  const showGeneralError = save.error && !(save.error instanceof ApiError && save.error.status === 422)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{project ? '編輯專案' : '新增專案'}</DialogTitle>
          <DialogDescription>{project ? project.id : '建立後可在列表中查看與修改'}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">名稱</Label>
            <Input id="name" aria-invalid={!!errors.name} {...form.register('name')} />
            {errors.name && <p className="text-destructive text-xs">{errors.name.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="description">說明</Label>
            <Textarea id="description" rows={3} aria-invalid={!!errors.description} {...form.register('description')} />
            {errors.description && <p className="text-destructive text-xs">{errors.description.message}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="status">狀態</Label>
              <Controller
                control={form.control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROJECT_STATUS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="priority">優先度</Label>
              <Controller
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROJECT_PRIORITY.map((p) => (
                        <SelectItem key={p} value={p}>
                          {PRIORITY_LABEL[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="owner">負責人</Label>
              <Input id="owner" aria-invalid={!!errors.owner} {...form.register('owner')} />
              {errors.owner && <p className="text-destructive text-xs">{errors.owner.message}</p>}
            </div>
          </div>
          {showGeneralError && (
            <p role="alert" className="text-destructive text-sm">
              {errorMessage(save.error)}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />}
              {project ? '儲存' : '建立'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
