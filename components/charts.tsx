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
 * Barras verticales de gasto por mes. Escala a la barra mas alta, con linea de
 * promedio punteada y referencia del maximo. Solo divs/CSS, sin librerias.
 */
export function MonthlyBars({
  data,
  format,
}: {
  data: MonthTotal[]
  format: (n: number) => string
}) {
  const max = Math.max(1, ...data.map((d) => d.total))
  const withSpend = data.filter((d) => d.total > 0)
  const avg = withSpend.length
    ? withSpend.reduce((s, d) => s + d.total, 0) / withSpend.length
    : 0
  const avgPct = max > 0 ? (avg / max) * 100 : 0

  return (
    <div>
      <div className="mb-1 flex justify-between text-[10px] text-slate-400 dark:text-slate-500">
        <span>{avg > 0 ? `prom ${format(avg)}` : ''}</span>
        <span>máx {format(max)}</span>
      </div>

      {/* área del gráfico: barras + línea de promedio */}
      <div className="relative h-44">
        {avg > 0 && (
          <div
            className="absolute inset-x-0 z-0 border-t border-dashed border-amber-400/70"
            style={{ bottom: `${avgPct}%` }}
          />
        )}
        <div className="relative z-10 flex h-full items-end gap-2">
          {data.map((d) => {
            const h = d.total > 0 ? Math.max((d.total / max) * 100, 2) : 0
            return (
              <div
                key={d.key}
                className="flex-1 rounded-t bg-emerald-500 transition-all hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                style={{ height: `${h}%` }}
                title={`${d.label}: ${format(d.total)}`}
              />
            )
          })}
        </div>
      </div>

      {/* etiquetas: mes + monto */}
      <div className="mt-1 flex gap-2">
        {data.map((d) => (
          <div key={d.key} className="flex-1 text-center">
            <div className="text-xs text-slate-500 dark:text-slate-400">{d.label}</div>
            <div className="text-[10px] tabular-nums text-slate-400 dark:text-slate-500">
              {d.total > 0 ? format(d.total) : '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
