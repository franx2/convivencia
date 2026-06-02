// Cotización del dólar oficial (precio de VENTA) desde dolarapi.com.
// API gratis y con CORS, así que se puede llamar desde el navegador.
export type DolarInfo = { venta: number; fecha: string | null }

export async function fetchDolarOficialVenta(): Promise<DolarInfo | null> {
  try {
    const res = await fetch('https://dolarapi.com/v1/dolares/oficial', { cache: 'no-store' })
    if (!res.ok) return null
    const d = (await res.json()) as { venta?: number; fechaActualizacion?: string }
    if (typeof d.venta !== 'number' || !(d.venta > 0)) return null
    return { venta: d.venta, fecha: d.fechaActualizacion ?? null }
  } catch {
    return null
  }
}
