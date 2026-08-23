import type { CierreEmbarqueService } from '../../domain/services/cierre-embarque.service'
import type { CerrarEmbarqueInput } from '../dto'

/**
 * Une pagos reportados en el cuadre de cierre (input.pedidos[].pagos) con
 * pagos de ventas libres en un solo array para calcular caja.
 *
 * FIX: antes se leía `pedidosRaw[].pagos` (fetch de Pago vía Prisma hecho
 * ANTES de procesar el cuadre). Los Pago del cuadre actual se crean recién
 * en ProcesarPedidoService.execute() (tx.pago.create), que corre DESPUÉS
 * de ese fetch y nunca muta el objeto pedidosRaw en memoria -- por lo tanto
 * `caja.efectivoReal` siempre daba 0 quando no había pagos previos a la
 * apertura del embarque. La fuente correcta es el cuadre mismo (lo que el
 * repartidor reporta haber cobrado en este cierre), igual que `montoPagado`
 * en procesar-pedido.service.ts. Los pedidos NO_ENTREGADO se excluyen
 * porque procesarNoEntregado() nunca crea Pago para ellos.
 */
export function coleccionarPagos(
  pedidosCuadre: CerrarEmbarqueInput['pedidos'],
  ventasLibres: NonNullable<CerrarEmbarqueInput['ventasLibres']>,
): Array<{ metodo: string; monto: number }> {
  const out: Array<{ metodo: string; monto: number }> = []
  for (const p of pedidosCuadre) {
    if (p.entregado === 'NO_ENTREGADO') continue
    for (const pg of p.pagos ?? []) {
      out.push({ metodo: pg.metodo, monto: pg.monto })
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
