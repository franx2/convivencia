'use client'

import { useEffect, useState } from 'react'
import { useBodyScrollLock } from '@/components/ui'
import { ErrorText } from '@/components/ui'

type Props = {
  value: string
  currency: string
  onChange: (value: string) => void
  /** Abre la calculadora automáticamente al montar (carga de un nuevo registro). */
  autoOpen?: boolean
}

const ops = new Set(['+', '-', '×', '÷'])

export function AmountCalculator({ value, currency, onChange, autoOpen = false }: Props) {
  const [open, setOpen] = useState(false)
  useBodyScrollLock(open)
  const [expr, setExpr] = useState('')
  const [error, setError] = useState<string | null>(null)

  function openCalc() {
    setExpr(value ? value.replace('.', ',') : '')
    setError(null)
    setOpen(true)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- abrir la calculadora al cargar un nuevo registro
    if (autoOpen) openCalc()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- abrir solo al montar / al cambiar autoOpen
  }, [autoOpen])

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
        className="flex min-h-[46px] w-full min-w-0 items-center justify-between gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-base outline-none transition hover:border-emerald-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 dark:border-[#26312d] dark:bg-[#131816] dark:text-[#f4f7f6] dark:focus:ring-[#173e32]"
      >
        <span className={`min-w-0 truncate tabular-nums ${value ? 'font-semibold text-slate-800 dark:text-slate-100' : 'text-muted'}`}>
          {value ? moneyPreview(Number(value), currency) : '0,00'}
        </span>
        <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          Calc
        </span>
      </button>

      {open && (
        <div className="scrim-in fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 px-0 sm:items-center sm:px-4">
          <div role="dialog" aria-modal="true" aria-label="Calculadora de monto" className="sheet-in max-h-[100dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[28px] bg-white shadow-2xl dark:bg-[#0b0e0d] sm:rounded-[28px]">
            <div className="bg-rose-600 px-4 pb-8 pt-3 text-white dark:bg-rose-800">
              <div className="mb-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="grid h-11 w-11 place-items-center rounded-full text-3xl leading-none text-white/90 active:bg-white/20"
                  aria-label="Cerrar calculadora"
                >
                  ‹
                </button>
                <p className="text-lg font-bold">Registro</p>
                <button
                  type="button"
                  onClick={() => push('C')}
                  className="grid h-11 min-w-11 place-items-center rounded-full bg-white/25 px-3 text-sm font-bold active:bg-white/40"
                  aria-label="Borrar todo"
                >
                  C
                </button>
              </div>
              <div className="flex items-center justify-end gap-2">
                <p className={`min-h-[64px] max-w-full truncate text-right font-bold tracking-normal ${displayFontSize(expr)}`}>
                  ${displayExpr(expr)}
                </p>
                <button
                  type="button"
                  onClick={() => push('⌫')}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/25 text-xl font-bold active:bg-white/40"
                  aria-label="Borrar dígito"
                >
                  ⌫
                </button>
              </div>
            </div>

            <div className="-mt-5 rounded-t-[28px] bg-white px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 dark:bg-[#0b0e0d]">
              <div className="grid grid-cols-4 gap-2.5">
                {['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '-', '0', ',', '=', '+'].map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => (key === '=' ? equals() : push(key))}
                    className={`h-[clamp(3rem,9.5dvh,4.5rem)] rounded-[1.4rem] text-[1.7rem] font-bold shadow-sm transition active:scale-95 ${
                      ops.has(key) || key === '='
                        ? 'bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-700'
                        : 'border border-slate-200 bg-white text-rose-700 hover:border-rose-200 dark:border-[#26312d] dark:bg-[#131816] dark:text-rose-300'
                    }`}
                  >
                    {key}
                  </button>
                ))}
              </div>

              {error && (
                <div className="mt-3 text-center">
                  <ErrorText>{error}</ErrorText>
                </div>
              )}

              <button
                type="button"
                onClick={accept}
                className="mt-3 min-h-12 w-full rounded-2xl bg-emerald-700 px-4 py-3 text-base font-bold text-white transition hover:bg-emerald-800 active:scale-[0.99] dark:bg-[#4ee6b0] dark:text-[#062419]"
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

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function displayExpr(expr: string): string {
  if (!expr) return '0,00'
  // Separa por operadores manteniéndolos, y agrupa de a miles cada número (formato AR: 1.234.567,89).
  return expr
    .split(/([+\-×÷])/)
    .map((part) => {
      if (!/^\d/.test(part)) return part
      const [intPart, decPart] = part.split(',')
      const grouped = groupThousands(intPart)
      return decPart !== undefined ? `${grouped},${decPart}` : grouped
    })
    .join('')
}

// Imita la calculadora de Apple: en vez de truncar con "...", el número achica
// la letra a medida que crece para seguir siendo legible entero.
function displayFontSize(expr: string): string {
  const digits = expr.replace(/\D/g, '').length
  if (digits > 12) return 'text-2xl'
  if (digits > 9) return 'text-3xl'
  if (digits > 6) return 'text-4xl'
  return 'text-6xl'
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
