'use client'

import { useState } from 'react'

type Props = {
  value: string
  currency: string
  onChange: (value: string) => void
}

const ops = new Set(['+', '-', '×', '÷'])

export function AmountCalculator({ value, currency, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [expr, setExpr] = useState('')
  const [error, setError] = useState<string | null>(null)

  function openCalc() {
    setExpr(value ? value.replace('.', ',') : '')
    setError(null)
    setOpen(true)
  }

  function push(key: string) {
    setError(null)
    setExpr((prev) => {
      if (key === 'C') return ''
      if (key === '⌫') return prev.slice(0, -1)
      if (key === ',' || key === '.') {
        const last = lastNumber(prev)
        return last.includes(',') || last.includes('.') ? prev : `${prev || '0'},`
      }
      if (ops.has(key)) {
        if (!prev) return ''
        const last = prev.at(-1) ?? ''
        return ops.has(last) ? `${prev.slice(0, -1)}${key}` : `${prev}${key}`
      }
      if (/^\d$/.test(key)) return `${prev}${key}`
      return prev
    })
  }

  function equals() {
    const result = evaluate(expr)
    if (result == null || !(result >= 0)) {
      setError('Revisá el cálculo.')
      return
    }
    setExpr(formatResult(result).replace('.', ','))
  }

  function accept() {
    const result = evaluate(expr)
    if (result == null || !(result > 0)) {
      setError('Ingresá un monto válido.')
      return
    }
    onChange(formatResult(result))
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={openCalc}
        className="flex min-h-10 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm outline-none transition hover:border-emerald-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-emerald-900/40"
      >
        <span className={value ? 'font-semibold text-slate-800 dark:text-slate-100' : 'text-slate-400'}>
          {value ? moneyPreview(Number(value), currency) : '0,00'}
        </span>
        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-600">
          Calc
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 px-0 sm:items-center sm:px-4">
          <div className="w-full max-w-md overflow-hidden rounded-t-[28px] bg-white shadow-2xl dark:bg-slate-950 sm:rounded-[28px]">
            <div className="bg-rose-400 px-6 pb-10 pt-7 text-white">
              <div className="mb-8 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-3xl leading-none text-white/90"
                  aria-label="Cerrar calculadora"
                >
                  ‹
                </button>
                <p className="text-lg font-bold">Registro</p>
                <button
                  type="button"
                  onClick={() => push('C')}
                  className="rounded-full bg-white/25 px-3 py-1 text-sm font-bold"
                >
                  C
                </button>
              </div>
              <div className="flex items-center justify-end gap-2">
                <p className="min-h-[64px] max-w-full truncate text-right text-6xl font-bold tracking-normal">
                  ${displayExpr(expr)}
                </p>
                <button
                  type="button"
                  onClick={() => push('⌫')}
                  className="shrink-0 rounded-full bg-white/25 px-3 py-1 text-xl font-bold"
                  aria-label="Borrar dígito"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="-mt-6 rounded-t-[28px] bg-white px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-6 dark:bg-slate-950">
              <div className="mb-6 flex gap-2 overflow-x-auto">
                {['Gastos', 'Tarjetas', 'Ingresos', 'Ahorros'].map((label, index) => (
                  <span
                    key={label}
                    className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold ${
                      index === 0
                        ? 'border-rose-400 bg-rose-400 text-white'
                        : 'border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                    }`}
                  >
                    {label}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-4 gap-4">
                {['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '-', '0', ',', '=', '+'].map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => (key === '=' ? equals() : push(key))}
                    className={`aspect-square rounded-full text-3xl font-bold shadow-sm transition active:scale-95 ${
                      ops.has(key) || key === '='
                        ? 'bg-rose-400 text-white hover:bg-rose-500'
                        : 'border border-slate-200 bg-white text-rose-400 hover:border-rose-200 dark:border-slate-800 dark:bg-slate-900'
                    }`}
                  >
                    {key}
                  </button>
                ))}
              </div>

              {error && <p className="mt-4 text-center text-sm font-medium text-red-600">{error}</p>}

              <button
                type="button"
                onClick={accept}
                className="mt-6 w-full rounded-2xl bg-emerald-600 px-4 py-3 text-base font-bold text-white transition hover:bg-emerald-700"
              >
                Usar monto
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function lastNumber(expr: string): string {
  const parts = expr.split(/[+\-×÷]/)
  return parts.at(-1) ?? ''
}

function displayExpr(expr: string): string {
  return expr || '0,00'
}

function formatResult(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, '')
}

function moneyPreview(value: number, currency: string): string {
  if (!Number.isFinite(value)) return '0,00'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function evaluate(raw: string): number | null {
  const normalized = raw.replace(/\s/g, '').replace(/,/g, '.').replace(/×/g, '*').replace(/÷/g, '/')
  if (!normalized || /[+\-*/.]$/.test(normalized)) return null
  const tokens = normalized.match(/\d+(?:\.\d+)?|[+\-*/]/g)
  if (!tokens?.length) return null

  const values: number[] = []
  const operators: string[] = []
  let expectingNumber = true

  for (const token of tokens) {
    if (/^\d/.test(token)) {
      values.push(Number(token))
      expectingNumber = false
      continue
    }
    if (expectingNumber) return null
    operators.push(token)
    expectingNumber = true
  }
  if (expectingNumber) return null

  for (let i = 0; i < operators.length; ) {
    const op = operators[i]
    if (op !== '*' && op !== '/') {
      i++
      continue
    }
    const left = values[i]
    const right = values[i + 1]
    if (op === '/' && right === 0) return null
    values.splice(i, 2, op === '*' ? left * right : left / right)
    operators.splice(i, 1)
  }

  let total = values[0]
  for (let i = 0; i < operators.length; i++) {
    total = operators[i] === '+' ? total + values[i + 1] : total - values[i + 1]
  }
  return Number.isFinite(total) ? total : null
}
