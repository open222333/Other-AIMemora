import { ListFilter, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface Props {
  title: string
  options: { value: string; label: string }[]
  /** 逗號分隔的已選值（與網址參數相同格式） */
  value?: string
  onChange: (value: string | undefined) => void
}

/** 多選篩選（下拉勾選） */
export function FacetedFilter({ title, options, value, onChange }: Props) {
  const selected = new Set(value ? value.split(',') : [])
  const toggle = (v: string) => {
    const next = new Set(selected)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    onChange(next.size ? [...next].join(',') : undefined)
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="border-dashed">
          <ListFilter />
          {title}
          {selected.size > 0 && (
            <Badge variant="secondary" className="rounded-sm px-1 font-normal">
              {selected.size <= 2 ? options.filter((o) => selected.has(o.value)).map((o) => o.label).join('、') : `${selected.size} 項`}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={selected.has(o.value)}
            onCheckedChange={() => toggle(o.value)}
            onSelect={(e) => e.preventDefault()}
          >
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
        {selected.size > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onChange(undefined)}>
              <X /> 清除篩選
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
