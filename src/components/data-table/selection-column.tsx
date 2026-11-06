import type { ColumnDef } from '@tanstack/react-table'

import { Checkbox } from '@/components/ui/checkbox'

/** 勾選欄（放在 columns 第一個） */
export function selectionColumn<T>(): ColumnDef<T> {
  return {
    id: 'select',
    enableSorting: false,
    enableHiding: false,
    size: 32,
    header: ({ table }) => (
      <Checkbox
        aria-label="全選本頁"
        checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label="選取"
        checked={row.getIsSelected()}
        onCheckedChange={(v) => row.toggleSelected(!!v)}
        onClick={(e) => e.stopPropagation()}
      />
    ),
  }
}
