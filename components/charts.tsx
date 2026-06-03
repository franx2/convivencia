'use client'

import { useEffect, useMemo, useRef } from 'react'
import type { EChartsOption, EChartsType } from 'echarts'
import type { MonthTotal } from '@/lib/balances'

export type DonutSlice = { label: string; value: number; color: string; symbol?: string }

const MAX_WHEEL_SLICES = 6

function topWheelData(data: DonutSlice[]): DonutSlice[] {
  return data
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, MAX_WHEEL_SLICES)
}

type CategoryChartItem = DonutSlice & { pct: number }
type CategoryChartPayload = {
  categoryLabel: string
  value: number
  pct: number
  symbol?: string
}

function formatterData(params: unknown): CategoryChartPayload | undefined {
  const one = Array.isArray(params) ? params[0] : params
  if (!one || typeof one !== 'object' || !('data' in one)) return undefined
  return one.data as CategoryChartPayload | undefined
}

function buildCategoryChartOption({
  data,
  total,
  format,
  dark,
}: {
  data: CategoryChartItem[]
  total: number
  format: (n: number) => string
  dark: boolean
}): EChartsOption {
  const textColor = dark ? '#e2e8f0' : '#334155'
  const mutedColor = dark ? '#94a3b8' : '#64748b'
  const borderColor = dark ? '#0f172a' : '#ffffff'

  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      borderWidth: 0,
      backgroundColor: dark ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255, 255, 255, 0.98)',
      textStyle: { color: textColor, fontFamily: 'inherit' },
      extraCssText: 'box-shadow: 0 10px 30px rgba(15,23,42,.18); border-radius: 10px;',
      formatter: (params) => {
        const item = formatterData(params)
        if (!item) return ''
        return `<strong>${item.symbol ?? '•'} ${item.categoryLabel}</strong><br/>${format(item.value)} · ${item.pct}%`
      },
    },
    graphic: [
      {
        type: 'text',
        left: 'center',
        top: '42%',
        silent: true,
        style: {
          text: 'Top 6',
          fill: mutedColor,
          fontSize: 11,
          fontWeight: 700,
          align: 'center',
        },
      },
      {
        type: 'text',
        left: 'center',
        top: '50%',
        silent: true,
        style: {
          text: format(total),
          fill: textColor,
          fontSize: 14,
          fontWeight: 800,
          align: 'center',
        },
      },
    ],
    series: [
      {
        type: 'pie',
        roseType: 'radius',
        radius: ['31%', '78%'],
        center: ['50%', '50%'],
        clockwise: true,
        startAngle: 90,
        minAngle: 8,
        padAngle: 2,
        selectedMode: 'multiple',
        selectedOffset: 12,
        avoidLabelOverlap: true,
        stillShowZeroSum: false,
        itemStyle: {
          borderColor,
          borderWidth: 3,
          borderRadius: 7,
          shadowColor: dark ? 'rgba(0,0,0,.45)' : 'rgba(15,23,42,.14)',
          shadowBlur: 12,
          shadowOffsetY: 4,
        },
        emphasis: {
          scale: true,
          scaleSize: 8,
          itemStyle: {
            shadowBlur: 18,
            shadowColor: dark ? 'rgba(0,0,0,.55)' : 'rgba(15,23,42,.25)',
          },
          label: {
            show: true,
            color: textColor,
          },
        },
        label: {
          show: true,
          position: 'inside',
          color: '#ffffff',
          fontWeight: 800,
          formatter: (params) => {
            const item = formatterData(params)
            if (!item) return ''
            return item.pct >= 7 ? `{symbol|${item.symbol ?? '•'}}\n{pct|${item.pct}%}` : `{symbol|${item.symbol ?? '•'}}`
          },
          rich: {
            symbol: {
              fontSize: 18,
              fontWeight: 800,
              lineHeight: 20,
              align: 'center',
            },
            pct: {
              fontSize: 11,
              fontWeight: 900,
              lineHeight: 14,
              align: 'center',
            },
          },
        },
        labelLine: { show: false },
        data: data.map((d, i) => ({
          name: d.label,
          categoryLabel: d.label,
          value: d.value,
          pct: d.pct,
          symbol: d.symbol,
          selected: i < 2,
          itemStyle: { color: d.color },
        })),
      },
    ],
  }
}

/** Grafico radial de categorias con ECharts: top 6, rose/exploded, emojis y tooltip. */
export function Donut({
  data,
  format,
  size = 292,
}: {
  data: DonutSlice[]
  format: (n: number) => string
  size?: number
  thickness?: number
}) {
  const chartRef = useRef<HTMLDivElement | null>(null)
  const total = data.reduce((s, d) => s + d.value, 0)
  const wheelData = useMemo(
    () =>
      topWheelData(data).map((d) => ({
        ...d,
        pct: total > 0 ? Math.round((d.value / total) * 100) : 0,
      })),
    [data, total]
  )

  useEffect(() => {
    const el = chartRef.current
    if (!el) return

    let chart: EChartsType | null = null
    let resizeObserver: ResizeObserver | null = null
    let cancelled = false

    async function render() {
      const echarts = await import('echarts')
      if (cancelled || !el) return

      const dark = document.documentElement.classList.contains('dark')
      chart = echarts.init(el, dark ? 'dark' : undefined, { renderer: 'svg' })
      chart.setOption(buildCategoryChartOption({ data: wheelData, total, format, dark }))

      resizeObserver = new ResizeObserver(() => chart?.resize())
      resizeObserver.observe(el)
    }

    render()

    return () => {
      cancelled = true
      resizeObserver?.disconnect()
      chart?.dispose()
    }
  }, [format, total, wheelData])

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative mx-auto w-full max-w-[292px] shrink-0">
        <div ref={chartRef} className="h-[292px] w-full" style={{ width: size, maxWidth: '100%' }} />
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
