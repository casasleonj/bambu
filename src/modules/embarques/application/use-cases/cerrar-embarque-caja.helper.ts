import type { CierreEmbarqueService } from '../../domain/services/cierre-embarque.service'

type PagoRow = { metodo: string; monto: number | { toNumber: () => number } }

type TxOrPrisma = {
  pago: {
    findMany: (args: {
      where: Record<string, unknown>
      select: Record<string, boolean>
    }) => Promise<unknown[]>
  }
}

/**
 * ADR-PAGO-EMBARQUE-CAPTURA-001 §5: "cobrado en la misión" del embarque `E` =
 * efecto neto de los `Pago` **capturados** en `E` (`Pago.embarqueId = E`).
 *
 *  - Lectura viva (dentro de la tx del cierre) → ve los `Pago` recién creados
 *    en este cierre (cuadre + ventas libres) y los previos de esta misión
 *    (entregas parciales, venta libre en ruta).
 *  - **A1 (regla de efecto monetario neto):** se excluyen los `Pago` de pedidos
 *    `ANULADO`/`CANCELADO` — el dinero se devolvió, efecto neto sobre la caja de
 *    la misión = $0. (No hay anulación parcial de pedidos, así que excluir por
 *    estado es exacto.)
 *  - `embarqueOrigenId` **ya NO participa** — una sola fuente de verdad.
 */
export async function coleccionarPagosDeMision(
  client: TxOrPrisma,
  embarqueId: string,
): Promise<Array<{ metodo: string; monto: number }>> {
  const rows = await client.pago.findMany({
    where: {
      embarqueId,
      pedido: { estadoEntrega: { notIn: ['ANULADO', 'CANCELADO'] } },
    },
    select: { metodo: true, monto: true },
  })
  return (rows as PagoRow[]).map((pg) => ({
    metodo: pg.metodo,
    monto: typeof pg.monto === 'number' ? pg.monto : pg.monto.toNumber(),
  }))
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
