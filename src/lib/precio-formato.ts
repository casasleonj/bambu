import { importeLineaCentavos } from '@/shared/domain/unit-price'

const precio = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 6 })
const importe = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const formatPrecioUnitario = (value: number): string =>
  Number.isFinite(value) ? `$${precio.format(value)}` : '—'

export const formatImportePedido = (value: number): string =>
  Number.isFinite(value) ? `$${importe.format(value)}` : '—'

/** Una entrada transitoria inválida se presenta como desconocida; nunca como deuda cero. */
export function importeLineaEditable(value: number, cantidad: number): number {
  try {
    return importeLineaCentavos(value, cantidad) / 100
  } catch {
    return Number.NaN
  }
}
