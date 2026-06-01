'use client'

import type { MonthTotal } from '@/lib/balances'

export type DonutSlice = { label: string; value: number; color: string }

/**
 * Donut chart en SVG puro (sin librerias). Cada slice es un arco dibujado con
 * stroke-dasharray sobre un circulo, rotado -90deg para arrancar arriba.
 */
export function Donut({
  data,
  format,
  size = 168,
  thickness = 24,
}: {
  data: DonutSlice[]
  format: (n: number) => string
  size?: number
  thickness?: number
}) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const cx = size / 2

  let acc = 0
  const arcs = data
    .filter((d) => d.value > 0)
    .map((d, i) => {
      const len = total > 0 ? (d.value / total) * c : 0
      const arc = (
        <circle
          key={i}
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={d.color}
          strokeWidth={thickness}
          strokeDasharray={`${len} ${c - len}`}
          strokeDashoffset={-acc}
          transform={`rotate(-90 ${cx} ${cx})`}
        >
          <title>{`${d.label}: ${format(d.value)}`}</title>
        </circle>
      )
      acc += len
      return arc
    })

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          {total > 0 ? (
            arcs
          ) : (
            <circle cx={cx} cy={cx} r={r} fill="none" stroke="#e2e8f0" strokeWidth={thickness} />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-slate-400">Total</span>
          <span className="text-sm font-semibold text-slate-700">{format(total)}</span>
        </div>
      </div>

      <ul className="w-full space-y-1.5">
        {data.map((d) => {
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0
          return (
            <li key={d.label} className="flex items-center gap-2 text-sm">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
              <span className="flex-1 text-slate-600">{d.label}</span>
              <span className="tabular-nums text-slate-500">{format(d.value)}</span>
              <span className="w-9 text-right tabular-nums text-xs text-slate-400">{pct}%</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * Barras verticales de gasto por mes (SVG/divs). Escala a la barra mas alta.
 */
export function MonthlyBars({
  data,
  format,
}: {
  data: MonthTotal[]
  format: (n: number) => string
}) {
  const max = Math.max(1, ...data.map((d) => d.total))
  return (
    <div className="flex h-40 items-end justify-between gap-2">
      {data.map((d) => {
        const h = Math.round((d.total / max) * 100)
        return (
          <div key={d.key} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-[10px] tabular-nums text-slate-400">
              {d.total > 0 ? format(d.total) : ''}
            </span>
            <div className="flex w-full flex-1 items-end">
              <div
                className="w-full rounded-t bg-emerald-500 transition-all"
                style={{ height: `${Math.max(h, d.total > 0 ? 4 : 0)}%` }}
                title={`${d.label}: ${format(d.total)}`}
              />
            </div>
            <span className="text-xs text-slate-500">{d.label}</span>
          </div>
        )
      })}
    </div>
  )
}
