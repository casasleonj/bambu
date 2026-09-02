import type { PedidoRawInput } from '../../domain/services/procesar-pedido.service'
import type { CierreEmbarqueService } from '../../domain/services/cierre-embarque.service'
import type { CerrarEmbarqueInput } from '../dto'

/**
 * Une pagos de pedidos del embarque con pagos de ventas libres en un solo
 * array para calcular caja. Los montos de Prisma Decimal se normalizan a number.
 */
export interface ColeccionarPagosOpts {
  /**
   * Id del embarque que se está cerrando. Si se pasa, los pagos de un pedido
   * cuyo `embarqueOrigenId` apunta a OTRO embarque se EXCLUYEN: su dinero se
   * concilió (o se conciliará) en el cierre de ese embarque de origen
   * (ADR-VENTA-RUTA-ENTREGA-POSTERIOR-001 §0 — la custodia sigue al evento de
   * cobro, no al de entrega).
   */
  embarqueId?: string
  /**
   * Pagos de pedidos que NACIERON como venta en ruta en este embarque pero cuya
   * entrega quedó pendiente (ya no están físicamente en él). Su dinero SÍ
   * pertenece a este cierre aunque el pedido se entregue en otro embarque.
   */
  pagosOrigenDiferido?: Array<{ metodo: string; monto: number }>
}

export function coleccionarPagos(
  pedidosRaw: PedidoRawInput[],
  ventasLibres: NonNullable<CerrarEmbarqueInput['ventasLibres']>,
  opts?: ColeccionarPagosOpts,
): Array<{ metodo: string; monto: number }> {
  const out: Array<{ metodo: string; monto: number }> = []
  for (const p of pedidosRaw) {
    const pedidoConPagos = p as unknown as {
      embarqueOrigenId?: string | null
      pagos?: Array<{ metodo: string; monto: number | { toNumber: () => number } }>
    }
    // §0: pedido reasignado desde otro embarque de origen → su dinero se
    // concilia allá, no acá. Evita doble conteo y falsos faltantes de caja.
    //
    // INVARIANTE (frágil, follow-up en el ADR): hoy `embarqueOrigenId` SOLO lo
    // escriben los flujos de venta en ruta (`venta-libre` route +
    // `crear-ventas-libres.service`). Si en el futuro se usara para pedidos
    // normales reasignados, este `continue` omitiría sus pagos silenciosamente.
    // El fix correcto es un tag `Pago.embarqueId` (conciliar por pago, no por
    // pedido).
    if (
      opts?.embarqueId &&
      pedidoConPagos.embarqueOrigenId &&
      pedidoConPagos.embarqueOrigenId !== opts.embarqueId
    ) {
      continue
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
  for (const pg of opts?.pagosOrigenDiferido ?? []) {
    out.push({ metodo: pg.metodo, monto: pg.monto || 0 })
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
