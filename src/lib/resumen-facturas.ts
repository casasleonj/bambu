import type { FacturaEstado } from '@/lib/facturas-filtros'
import { FACTURA_ESTADOS } from '@/lib/facturas-filtros'

/** Mínimo que necesita el resumen de cada factura (importes ya en número). */
export interface FacturaParaResumen {
  estado: FacturaEstado
  total: number
  montoPagado: number
  saldo: number
}

export interface TotalesResumen {
  total: number
  totalPagado: number
  saldo: number
  count: number
}

export interface AnuladasResumen {
  count: number
  /** Importe histórico. No es venta vigente ni deuda cobrable. */
  totalHistorico: number
}

export type ConteosPorEstado = Record<FacturaEstado, number>

/**
 * Totales del resumen consolidado: solo facturas vigentes. Las ANULADAS se
 * reportan aparte y NUNCA suman a ventas, pagado ni saldo (conservan
 * `montoPagado` histórico, que no es cobranza efectiva). Filas y totales salen
 * de la misma lista, así coinciden siempre con lo que ve el usuario.
 */
export function totalizarResumen(facturas: readonly FacturaParaResumen[]): {
  totales: TotalesResumen
  anuladas: AnuladasResumen
} {
  const totales: TotalesResumen = { total: 0, totalPagado: 0, saldo: 0, count: 0 }
  const anuladas: AnuladasResumen = { count: 0, totalHistorico: 0 }
  for (const f of facturas) {
    if (f.estado === 'ANULADA') {
      anuladas.count += 1
      anuladas.totalHistorico += f.total
      continue
    }
    totales.total += f.total
    totales.totalPagado += f.montoPagado
    totales.saldo += f.saldo
    totales.count += 1
  }
  return { totales, anuladas }
}

/** Conteos por estado (para las pestañas) a partir del resultado de un groupBy. */
export function conteosPorEstado(
  filas: readonly { estado: FacturaEstado; count: number }[],
): ConteosPorEstado {
  const conteos = Object.fromEntries(FACTURA_ESTADOS.map((e) => [e, 0])) as ConteosPorEstado
  for (const fila of filas) conteos[fila.estado] += fila.count
  return conteos
}
