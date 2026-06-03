'use client'

import type { MonthTotal } from '@/lib/balances'

export type DonutSlice = { label: string; value: number; color: string; symbol?: string }

const MAX_WHEEL_SLICES = 6
const EXPLODE_MAX = 30

function polarPoint(cx: number, cy: number, r: number, angle: number) {
  const a = (angle * Math.PI) / 180
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}

function ringPath(cx: number, cy: number, outerR: number, innerR: number, start: number, end: number) {
  const safeEnd = Math.min(end, start + 359.99)
  const outerStart = polarPoint(cx, cy, outerR, start)
  const outerEnd = polarPoint(cx, cy, outerR, safeEnd)
  const innerStart = polarPoint(cx, cy, innerR, start)
  const innerEnd = polarPoint(cx, cy, innerR, safeEnd)
  const large = safeEnd - start > 180 ? 1 : 0

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ')
}

function topWheelData(data: DonutSlice[]): DonutSlice[] {
  return data
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, MAX_WHEEL_SLICES)
}

/** Grafico radial de categorias, con segmentos explotados segun gasto. */
export function Donut({
  data,
  format,
  size = 268,
  thickness = 58,
}: {
  data: DonutSlice[]
  format: (n: number) => string
  size?: number
  thickness?: number
}) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const wheelData = topWheelData(data)
  const wheelTotal = wheelData.reduce((s, d) => s + d.value, 0)
  const maxValue = Math.max(1, ...wheelData.map((d) => d.value))
  const cx = size / 2
  const outerR = size / 2 - EXPLODE_MAX - 8
  const innerR = Math.max(48, outerR - thickness)
  const labelR = innerR + (outerR - innerR) / 2
  const gap = wheelData.length > 1 ? 4 : 0

  let angle = -90
  const segments = wheelData.map((d, i) => {
    const span = wheelTotal > 0 ? (d.value / wheelTotal) * 360 : 0
    const start = angle + gap / 2
    const end = angle + span - gap / 2
    const mid = start + Math.max(end - start, 0) / 2
    const p = polarPoint(cx, cx, labelR, mid)
    const offset = 5 + (d.value / maxValue) * EXPLODE_MAX
    const shift = polarPoint(0, 0, offset, mid)
    const pct = total > 0 ? Math.round((d.value / total) * 100) : 0
    angle += span

    return {
      ...d,
      key: `${d.label}-${i}`,
      path: ringPath(cx, cx, outerR, innerR, start, Math.max(end, start + 0.1)),
      x: p.x + shift.x,
      y: p.y + shift.y,
      dx: shift.x,
      dy: shift.y,
      pct,
    }
  })

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative mx-auto w-full max-w-[268px] shrink-0" style={{ width: size }}>
        <svg
          viewBox={`-${EXPLODE_MAX} -${EXPLODE_MAX} ${size + EXPLODE_MAX * 2} ${size + EXPLODE_MAX * 2}`}
          className="h-auto w-full overflow-visible"
          role="img"
        >
          <title>Gastos por categoria</title>
          {total > 0 ? (
            segments.map((d) => (
              <g key={d.key} transform={`translate(${d.dx} ${d.dy})`}>
                <path d={d.path} fill={d.color} stroke="white" strokeWidth="2.5">
                  <title>{`${d.label}: ${format(d.value)}`}</title>
                </path>
                {d.pct >= 4 && (
                  <text
                    x={d.x - d.dx}
                    y={d.y - d.dy}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="white"
                    fontSize={d.pct >= 8 ? 17 : 14}
                    fontWeight="700"
                  >
                    <tspan x={d.x - d.dx} dy={d.pct >= 8 ? -8 : 0}>
                      {d.symbol ?? '•'}
                    </tspan>
                    {d.pct >= 8 && (
                      <tspan x={d.x - d.dx} dy="16" fontSize="11" fontWeight="800">
                        {d.pct}%
                      </tspan>
                    )}
                  </text>
                )}
              </g>
            ))
          ) : (
            <path d={ringPath(cx, cx, outerR, innerR, -90, 269.99)} fill="#e2e8f0" />
          )}
          <circle
            cx={cx}
            cy={cx}
            r={innerR - 7}
            fill="white"
            stroke="#e2e8f0"
            strokeWidth="2"
            className="dark:fill-slate-950 dark:stroke-slate-800"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Categorías</span>
          <span className="mt-0.5 max-w-[92px] truncate text-center text-sm font-bold text-slate-700 dark:text-slate-100">
            {format(total)}
          </span>
        </div>
      </div>

      <ul className="w-full space-y-2">
        {wheelData.map((d) => {
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0
          return (
            <li key={d.label} className="text-sm">
              <div className="mb-1 flex items-center gap-2">
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm"
                  style={{ backgroundColor: d.color }}
                >
                  {d.symbol ?? '•'}
                </span>
                <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">{d.label}</span>
                <span className="tabular-nums text-slate-500 dark:text-slate-400">{format(d.value)}</span>
                <span className="w-9 text-right tabular-nums text-xs text-slate-400">{pct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: d.color }} />
              </div>
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
