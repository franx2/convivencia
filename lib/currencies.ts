export const CURRENCIES = [
  { code: 'ARS', label: 'Peso argentino (ARS)' },
  { code: 'USD', label: 'Dolar (USD)' },
  { code: 'EUR', label: 'Euro (EUR)' },
  { code: 'BRL', label: 'Real (BRL)' },
  { code: 'CLP', label: 'Peso chileno (CLP)' },
  { code: 'UYU', label: 'Peso uruguayo (UYU)' },
  { code: 'GBP', label: 'Libra (GBP)' },
] as const

export type CurrencyCode = (typeof CURRENCIES)[number]['code']

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}
