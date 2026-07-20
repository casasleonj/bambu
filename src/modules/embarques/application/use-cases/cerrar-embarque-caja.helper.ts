import type { PedidoRawInput } from '../../domain/services/procesar-pedido.service'
import type { CierreEmbarqueService } from '../../domain/services/cierre-embarque.service'
import type { CerrarEmbarqueInput } from '../dto'

/**
 * Une pagos de pedidos del embarque con pagos de ventas libres en un solo
 * array para calcular caja. Los montos de Prisma Decimal se normalizan a number.
 */
export function coleccionarPagos(
  pedidosRaw: PedidoRawInput[],
  ventasLibres: NonNullable<CerrarEmbarqueInput['ventasLibres']>,
): Array<{ metodo: string; monto: number }> {
  const out: Array<{ metodo: string; monto: number }> = []
  for (const p of pedidosRaw) {
    const pedidoConPagos = p as unknown as {
      pagos?: Array<{ metodo: string; monto: number | { toNumber: () => number } }>
    }
    if (Array.isArray(pedidoConPagos.pagos)) {
      for (const pg of pedidoConPagos.pagos) {
        const monto = typeof pg.monto === 'number' ? pg.monto : pg.monto.toNumber()
        out.push({ metodo: pg.metodo, monto })
      }
    }
  }
  for (const v of ventasLibres) {
    if (Array.isArray(v.pagos)) {
      for (const pg of v.pagos) {
        out.push({ metodo: pg.metodo, monto: pg.monto || 0 })
      }
    }
  }
  return out
}

/**
 * Calcula el resumen final de caja usando CierreEmbarqueService.calcularCaja.
 */
export function calcularCajaFinal(
  cierreService: CierreEmbarqueService,
  baseDinero: number,
  pagos: Array<{ metodo: string; monto: number }>,
  gastosTotal: number,
  dineroEntregado: number,
) {
  const cajaCalc = cierreService.calcularCaja(pagos, baseDinero, gastosTotal)
  return {
    efectivoEsperado: cajaCalc.efectivoEsperado,
    efectivoReal: cajaCalc.efectivoReal,
    diferencia: cajaCalc.diferencia,
    otrosPagos: cajaCalc.otrosPagos,
    dineroEntregadoReportado: dineroEntregado,
    sobranteFaltante: dineroEntregado - cajaCalc.efectivoReal,
  }
}
