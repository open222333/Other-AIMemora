import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'

import { ApiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { errorMessage } from '@/lib/query'

import { useSaveMemory } from './api'
import {
  AI_SUBJECTS,
  CATEGORIES,
  CATEGORY_LABEL,
  emptyMemory,
  fromMemory,
  memoryInput,
  STATUS_LABEL,
  STATUSES,
  toPayload,
  type Memory,
  type MemoryInput,
} from './schema'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  memory?: Memory | null
  /** 新增時的預設 visibility（工作空間設定） */
  defaultVisibility?: string[]
  onDuplicate?: (existingId: string) => void
}

function applyServerErrors(e: unknown, setError: (name: keyof MemoryInput, err: { message: string }) => void) {
  if (!(e instanceof ApiError) || e.status !== 422) return
  const detail = (e.body as { detail?: { loc?: string[]; msg?: string }[] })?.detail
  if (!Array.isArray(detail)) return
  for (const d of detail) {
    const field = d.loc?.[1] as keyof MemoryInput | undefined
    if (field && field in emptyMemory) setError(field, { message: d.msg ?? '格式錯誤' })
  }
}

export function MemoryFormDialog({ open, onOpenChange, memory, defaultVisibility = [], onDuplicate }: Props) {
  const save = useSaveMemory()
  const form = useForm<MemoryInput>({ resolver: zodResolver(memoryInput), defaultValues: emptyMemory })
  const { errors } = form.formState

  useEffect(() => {
    if (open) {
      form.reset(memory ? fromMemory(memory) : { ...emptyMemory, visibility: defaultVisibility })
      save.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, memory])

  const onSubmit = form.handleSubmit((v) =>
    save.mutate(
      { id: memory?.id, data: toPayload(v, !!memory) },
      { onSuccess: () => onOpenChange(false), onError: (e) => applyServerErrors(e, form.setError) },
    ),
  )
  const err = save.error
  const duplicateId = err instanceof ApiError && err.status === 409 ? (err.body as { existing_id?: string })?.existing_id : undefined
  const showGeneralError = err && !(err instanceof ApiError && err.status === 422)
  const statusOptions = memory ? STATUSES : (['active', 'pending'] as const)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{memory ? '編輯記憶' : '新增記憶'}</DialogTitle>
          <DialogDescription>{memory ? `${memory.id} · v${memory.version}（儲存後產生新版本）` : '手動新增一筆長期記憶'}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="content">內容</Label>
            <Textarea
              id="content"
              rows={4}
              placeholder="例如：偏好使用繁體中文回答"
              aria-invalid={!!errors.content}
              {...form.register('content')}
            />
            {errors.content && <p className="text-destructive text-xs">{errors.content.message}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="category">分類</Label>
              <Controller
                control={form.control}
                name="category"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="category" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {CATEGORY_LABEL[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="status">狀態</Label>
              <Controller
                control={form.control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem_10rem]">
            <div className="flex flex-col gap-2">
              <Label htmlFor="tags">標籤</Label>
              <Input id="tags" placeholder="language, communication" {...form.register('tags')} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confidence">可信度</Label>
              <Input
                id="confidence"
                type="number"
                min={0}
                max={1}
                step={0.05}
                aria-invalid={!!errors.confidence}
                {...form.register('confidence', { valueAsNumber: true })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="expires_at">到期日（選填）</Label>
              <Input id="expires_at" type="date" {...form.register('expires_at')} />
            </div>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">允許讀取的 AI</legend>
            <Controller
              control={form.control}
              name="visibility"
              render={({ field }) => (
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {AI_SUBJECTS.map((s) => {
                    const checked = field.value.includes(s.value)
                    const disabled = s.value !== '*' && field.value.includes('*')
                    return (
                      <label key={s.value} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={checked || disabled}
                          disabled={disabled}
                          onCheckedChange={(c) =>
                            field.onChange(
                              c
                                ? s.value === '*'
                                  ? ['*']
                                  : [...field.value, s.value]
                                : field.value.filter((x) => x !== s.value),
                            )
                          }
                        />
                        {s.label}
                      </label>
                    )
                  })}
                </div>
              )}
            />
            <p className="text-muted-foreground text-xs">未勾選 = 僅自己可見，任何 AI 都無法透過 API 讀取（最小權限）。</p>
          </fieldset>
          {memory && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="change_reason">變更原因（選填，記錄在版本歷史）</Label>
              <Input id="change_reason" {...form.register('change_reason')} />
            </div>
          )}
          {showGeneralError && (
            <p role="alert" className="text-destructive text-sm">
              {errorMessage(err)}
              {duplicateId && onDuplicate && (
                <>
                  {' '}
                  <button type="button" className="underline" onClick={() => onDuplicate(duplicateId)}>
                    查看既有記憶
                  </button>
                </>
              )}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="animate-spin" />}
              {memory ? '儲存' : '新增'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
