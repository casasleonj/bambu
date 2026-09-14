/**
 * SolicitarExcepcionCreditoUseCase — F2 (Excepciones de Crédito).
 *
 * Crea una `PedidoExcepcionCredito(PENDIENTE)` para UNA operación concreta.
 * El snapshot monetario/de conteo se toma tal cual del resultado de la
 * Autoridad de Crédito (F1, `GetFiadoStatusUseCase`) — esta clase no
 * recalcula límite/count/saldo por su cuenta.
 *
 * Ver docs/AGUA_BAMBU_F2_MAPA_Y_DISENO_EXCEPCIONES_CREDITO_v1.0.md §2/§4.
 */

import { prisma } from '@/lib/prisma'
import { notifyEvent } from '@/lib/notifications/notify-event'
import { GetFiadoStatusUseCase } from './GetFiadoStatusUseCase'

export class ExcepcionNoNecesariaError extends Error {
  constructor() {
    super('EXCEPCION_NO_NECESARIA: el cliente no está sobre el límite de fiados para esta operación')
    this.name = 'ExcepcionNoNecesariaError'
  }
}

export interface SolicitarExcepcionCreditoInput {
  clienteId: string
  motivoSolicitud: string
  notaSolicitud?: string
  solicitadoPorId: string
  operacion: { total: number; totalPagado: number }
  /** Offline-first: dedup por reintento de la misma solicitud (ver AGENTS.md, offlineId). */
  offlineId?: string
}

export interface SolicitarExcepcionCreditoResult {
  id: string
  estado: 'PENDIENTE'
  deduped: boolean
}

export class SolicitarExcepcionCreditoUseCase {
  constructor(private getFiadoStatusUseCase: GetFiadoStatusUseCase) {}

  async execute(input: SolicitarExcepcionCreditoInput): Promise<SolicitarExcepcionCreditoResult> {
    if (input.offlineId) {
      const existente = await prisma.pedidoExcepcionCredito.findUnique({ where: { offlineId: input.offlineId } })
      if (existente) {
        return { id: existente.id, estado: 'PENDIENTE', deduped: true }
      }
    }

    // Autoridad de F1: única fuente de la decisión y del snapshot monetario.
    const fiado = await this.getFiadoStatusUseCase.execute({
      clienteId: input.clienteId,
      operacion: input.operacion,
    })

    if (!fiado.errorDeuda) {
      throw new ExcepcionNoNecesariaError()
    }

    const excepcion = await prisma.pedidoExcepcionCredito.create({
      data: {
        clienteId: input.clienteId,
        motivoSolicitud: input.motivoSolicitud,
        notaSolicitud: input.notaSolicitud,
        solicitadoPorId: input.solicitadoPorId,
        limiteSnapshot: fiado.limite,
        fiadosAbiertosSnapshot: fiado.count,
        saldoFiadoSnapshot: fiado.outstandingAmount,
        operacionSaldoSnapshot: fiado.operationOutstanding ?? 0,
        fiadosDespuesSnapshot: fiado.projectedOpenCount ?? fiado.count,
        saldoDespuesSnapshot: fiado.projectedOutstandingAmount ?? fiado.outstandingAmount,
        offlineId: input.offlineId,
      },
    })

    void notifyEvent('EXCEPCION_CREDITO_SOLICITADA', {
      title: 'Excepción de crédito solicitada',
      body: `Un cliente sobre el límite de fiados necesita autorización (${input.motivoSolicitud}).`,
      url: `/pedidos?openExcepcionCredito=${excepcion.id}`,
    })

    return { id: excepcion.id, estado: 'PENDIENTE', deduped: false }
  }
}
