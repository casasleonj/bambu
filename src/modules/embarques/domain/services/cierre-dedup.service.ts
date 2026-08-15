/**
 * CierreDedupService.
 *
 * BAMBU-LOG-006: offline-first dedup para el cierre de embarque.
 *
 * Cerrar embarque usa `fetch` directo (no fetchResilient) hasta este fix,
 * así que un corte de red justo al recibir la respuesta deja al cliente
 * sin saber si el cierre se aplicó. `fetchResilient` encola el request y
 * lo reintenta con el MISMO offlineId al recuperar conexión. Sin este
 * service, ese replay llegaría a un embarque ya CERRADO y fallaría con
 * "transición inválida" — un 4xx que la cola offline nunca reintenta,
 * dejando el item atascado para siempre.
 *
 * Responsabilidad única: detectar el replay y reconstruir un resultado
 * idempotente sin re-ejecutar ningún side effect (pedidos/gastos/ventas
 * libres ya se procesaron en la ejecución original).
 */

import type { CierreResultadoDTO } from '../../application/dto'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TxOrPrisma = any

export class CierreDedupService {
  /**
   * true si el embarque ya está CERRADO con el mismo offlineId que trae
   * este request — es decir, este request ya se aplicó antes.
   */
  esReplay(
    embarqueEstado: { isCerrado: boolean },
    embarqueOfflineId: string | undefined,
    inputOfflineId: string | undefined,
  ): boolean {
    return Boolean(inputOfflineId) && embarqueEstado.isCerrado && embarqueOfflineId === inputOfflineId
  }

  /**
   * Reconstruye el resultado del cierre ya aplicado. Solo repuebla los
   * campos que la UI de cierre realmente consume (el toast de "deuda
   * creada"); el resto queda en su valor neutro porque no se re-ejecuta
   * ningún cálculo.
   */
  async buildResult(client: TxOrPrisma, embarqueId: string, trabajadorId: string): Promise<CierreResultadoDTO> {
    const deuda = await client.deudaTrabajador.findFirst({
      where: { embarqueId, trabajadorId, tipo: 'DEFICIT_EFECTIVO' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, montoOriginal: true },
    })

    return {
      embarqueId,
      estado: 'CERRADO',
      pedidosProcesados: 0,
      pedidosHijosCreados: [],
      pedidosActualizados: [],
      ventasLibresCreadas: 0,
      discrepanciaTotal: 0,
      deudaCreada: deuda ? { id: deuda.id, monto: Number(deuda.montoOriginal) } : undefined,
      gastosCreados: 0,
      totalVentas: 0,
      comision: 0,
      caja: {
        efectivoEsperado: 0,
        efectivoReal: 0,
        diferencia: 0,
        otrosPagos: 0,
        dineroEntregadoReportado: 0,
        sobranteFaltante: 0,
      },
      deduped: true,
    }
  }
}
