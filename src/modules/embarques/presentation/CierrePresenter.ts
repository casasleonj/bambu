/**
 * CierrePresenter.
 *
 * Presentation adapter for the embarque closing flow.
 * Converts the CierreResultadoDTO to the legacy shape expected by the UI.
 */

import type { CierreResultadoDTO } from '../application/dto'

export interface CierreLegacyResponse {
  embarque: {
    id: string
    estado: string
    horaLlegada: string
    dineroEntregado: number
  }
  pedidosActualizados: Array<{ id: string; estado: string }>
  pedidosHijosCreados: Array<{ id: string; numero: number }>
  ventasLibresCreadas: Array<{ id: string; numero: number }>
  pagosRegistrados: Array<{ pedidoId: string; monto: number }>
  gastosCreados: Array<{ id: string; monto: number }>
  conciliacion: {
    totalCargado: Record<string, number>
    totalEntregado: Record<string, number>
    discrepancias: Record<string, number>
    totalDiscrepancy: number
    justificacionDiscrepancia: string | null
  }
  descuento: { id: string; monto: number } | null
  // PR3: exponer resumen de caja y deuda generada para la UI de cierre.
  caja: {
    efectivoEsperado: number
    efectivoReal: number
    diferencia: number
    otrosPagos: number
    dineroEntregadoReportado: number
    sobranteFaltante: number
  }
  deudaCreada: { id: string; monto: number } | null
}

export class CierrePresenter {
  /**
   * Converts CierreResultadoDTO to the legacy API response shape.
   * This maintains backward compatibility with the existing UI.
   */
  static toLegacyResponse(result: CierreResultadoDTO): CierreLegacyResponse {
    return {
      embarque: {
        id: result.embarqueId,
        estado: result.estado,
        horaLlegada: new Date().toISOString(),
        dineroEntregado: 0, // Filled by use case input
      },
      pedidosActualizados: result.pedidosActualizados,
      pedidosHijosCreados: result.pedidosHijosCreados,
      ventasLibresCreadas: [], // Count only in new DTO
      pagosRegistrados: [], // Not tracked in new DTO
      gastosCreados: [], // Count only in new DTO
      conciliacion: {
        totalCargado: {}, // Calculated internally
        totalEntregado: {}, // Calculated internally
        discrepancias: Object.fromEntries(
          result.descuentoCreado ? [['total', result.discrepanciaTotal]] : [],
        ),
        totalDiscrepancy: result.discrepanciaTotal,
        justificacionDiscrepancia: null,
      },
      descuento: result.descuentoCreado ?? null,
      caja: result.caja,
      deudaCreada: result.deudaCreada ?? null,
    }
  }
}
