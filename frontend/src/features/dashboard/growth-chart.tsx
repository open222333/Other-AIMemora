/**
 * 記憶成長趨勢（單一系列面積圖）：2px 線、10% 面積、hairline 格線、十字線 + tooltip。
 * 單一系列不顯示圖例（標題已說明），並提供表格檢視作為無障礙替代。
 */
import { useId, useMemo, useState } from 'react'

import { formatNumber } from '@/lib/format'

interface Point {
  date: string
  created: number
  total: number
}

const W = 640
const H = 200
const PAD = { top: 12, right: 12, bottom: 24, left: 40 }

function niceMax(v: number) {
  if (v <= 5) return 5
  const p = 10 ** Math.floor(Math.log10(v))
  return Math.ceil(v / p) * p
}

const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`

export function GrowthChart({ data }: { data: Point[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)
  const gradientId = useId()

  const { x, y, max, line, area } = useMemo(() => {
    const max = niceMax(Math.max(1, ...data.map((d) => d.total)))
    const iw = W - PAD.left - PAD.right
    const ih = H - PAD.top - PAD.bottom
    const x = (i: number) => PAD.left + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw)
    const y = (v: number) => PAD.top + ih - (v / max) * ih
    const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.total).toFixed(1)}`)
    return {
      x,
      y,
      max,
      line: `M${pts.join('L')}`,
      area: `M${x(0)},${y(0)}L${pts.join('L')}L${x(data.length - 1)},${y(0)}Z`,
    }
  }, [data])

  if (!data.length) return null
  const ticks = [0, max / 2, max]
  const labelEvery = Math.ceil(data.length / 6)
  const h = hover !== null ? data[hover] : null

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-none"
          role="img"
          aria-label={`記憶總數由 ${data[0].total} 成長到 ${data[data.length - 1].total}`}
          onPointerLeave={() => setHover(null)}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            const px = ((e.clientX - r.left) / r.width) * W
            const i = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * (data.length - 1))
            setHover(Math.max(0, Math.min(data.length - 1, i)))
          }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--chart-1)" stopOpacity="0.16" />
              <stop offset="1" stopColor="var(--chart-1)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px]">
                {formatNumber(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) =>
            i % labelEvery === 0 || i === data.length - 1 ? (
              <text key={d.date} x={x(i)} y={H - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                {shortDate(d.date)}
              </text>
            ) : null,
          )}
          <path d={area} fill={`url(#${gradientId})`} />
          <path d={line} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {/* 終點標示 */}
          <circle cx={x(data.length - 1)} cy={y(data[data.length - 1].total)} r={4} fill="var(--chart-1)" stroke="var(--card)" strokeWidth={2} />
          {h && hover !== null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={y(0)} stroke="var(--muted-foreground)" strokeOpacity={0.4} strokeWidth={1} />
              <circle cx={x(hover)} cy={y(h.total)} r={4} fill="var(--chart-1)" stroke="var(--card)" strokeWidth={2} />
            </g>
          )}
        </svg>
        {h && hover !== null && (
          <div
            className="bg-popover text-popover-foreground pointer-events-none absolute top-0 rounded-md border px-2.5 py-1.5 text-xs shadow-md"
            style={{
              left: `${(x(hover) / W) * 100}%`,
              transform: `translateX(${hover > data.length / 2 ? '-105%' : '5%'})`,
            }}
          >
            <div className="text-muted-foreground">{h.date}</div>
            <div className="font-medium tabular-nums">總數 {formatNumber(h.total)}</div>
            <div className="text-muted-foreground tabular-nums">新增 {formatNumber(h.created)}</div>
          </div>
        )}
      </div>
      <button className="text-muted-foreground hover:text-foreground self-end text-xs underline-offset-2 hover:underline" onClick={() => setShowTable((s) => !s)}>
        {showTable ? '隱藏表格' : '以表格檢視'}
      </button>
      {showTable && (
        <div className="max-h-48 overflow-y-auto rounded-md border text-xs">
          <table className="w-full">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="px-2 py-1 text-left font-medium">日期</th>
                <th className="px-2 py-1 text-right font-medium">新增</th>
                <th className="px-2 py-1 text-right font-medium">總數</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.date} className="border-t">
                  <td className="px-2 py-1">{d.date}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{d.created}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{d.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
