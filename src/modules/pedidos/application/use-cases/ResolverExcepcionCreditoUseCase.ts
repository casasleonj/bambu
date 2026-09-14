/**
 * ResolverExcepcionCreditoUseCase — F2 (Excepciones de Crédito).
 *
 * Mismo patrón de concurrencia/idempotencia que
 * `ResolverResponsibilityCaseUseCase` (ADR-RESPONSABILIDAD-001): advisory
 * lock global de baja contención + "ya resuelta → deduped", en vez de
 * inventar un mecanismo nuevo. `PENDIENTE → AUTORIZADA` / `PENDIENTE →
 * RECHAZADA` son las dos únicas transiciones válidas — nunca reversibles.
 *
 * Revalidación (ALS §12/§15): se llama a la Autoridad de F1
 * (`GetFiadoStatusUseCase`) con el estado ACTUAL del cliente para que el
 * autorizador decida con datos frescos — el snapshot tomado al solicitar
 * (`*Snapshot` en la entidad) NUNCA se sobreescribe con este resultado, se
 * conserva tal cual quedó al momento de la solicitud (auditoría).
 *
 * Ver docs/AGUA_BAMBU_F2_MAPA_Y_DISENO_EXCEPCIONES_CREDITO_v1.0.md §5.
 */

import { withAdvisoryLock } from '@/lib/locks'
import { notifyEvent } from '@/lib/notifications/notify-event'
import { GetFiadoStatusUseCase } from './GetFiadoStatusUseCase'
import type { FiadoStatus } from '../../domain/types'

export class ExcepcionCreditoNotFoundError extends Error {
  constructor(id: string) {
    super(`EXCEPCION_CREDITO_NOT_FOUND: ${id}`)
    this.name = 'ExcepcionCreditoNotFoundError'
  }
}

export interface ResolverExcepcionCreditoInput {
  excepcionId: string
  resolucion: 'AUTORIZAR' | 'RECHAZAR'
  actorId: string
  nota?: string
}

export interface ResolverExcepcionCreditoResult {
  id: string
  estado: 'AUTORIZADA' | 'RECHAZADA'
  deduped: boolean
  /** Estado de crédito revalidado AL MOMENTO DE RESOLVER — no el snapshot original. Ausente si `deduped`. */
  estadoActual?: FiadoStatus
}

export class ResolverExcepcionCreditoUseCase {
  constructor(private getFiadoStatusUseCase: GetFiadoStatusUseCase) {}

  async execute(input: ResolverExcepcionCreditoInput): Promise<ResolverExcepcionCreditoResult> {
    const result = await withAdvisoryLock('SECUENCIA', 'excepcion-credito', async (tx) => {
      const excepcion = await tx.pedidoExcepcionCredito.findUnique({ where: { id: input.excepcionId } })
      if (!excepcion) {
        throw new ExcepcionCreditoNotFoundError(input.excepcionId)
      }

      // Idempotencia: "primera transición válida gana" — dos autorizadores
      // concurrentes solo uno de ellos entra acá con PENDIENTE; el que llega
      // después (ya sea a través del lock o después de haber leído estado
      // viejo) recibe deduped:true con la resolución que ya quedó fija.
      if (excepcion.estado !== 'PENDIENTE') {
        return {
          id: excepcion.id,
          estado: excepcion.estado as 'AUTORIZADA' | 'RECHAZADA',
          deduped: true as const,
        }
      }

      // Revalidación: estado ACTUAL del cliente, no el snapshot de la
      // solicitud — informativo para el autorizador, nunca sustituye su
      // decisión ni se persiste sobre los campos *Snapshot ya guardados.
      const estadoActual = await this.getFiadoStatusUseCase.execute({
        clienteId: excepcion.clienteId,
        operacion: {
          total: Number(excepcion.operacionSaldoSnapshot),
          totalPagado: 0,
        },
        tx,
      })

      const autoriza = input.resolucion === 'AUTORIZAR'
      await tx.pedidoExcepcionCredito.update({
        where: { id: excepcion.id },
        data: autoriza
          ? {
              estado: 'AUTORIZADA',
              autorizadoPorId: input.actorId,
              autorizadoAt: new Date(),
              notaAutorizacion: input.nota,
            }
          : {
              estado: 'RECHAZADA',
              rechazadoPorId: input.actorId,
              rechazadoAt: new Date(),
              notaRechazo: input.nota,
            },
      })

      return {
        id: excepcion.id,
        estado: (autoriza ? 'AUTORIZADA' : 'RECHAZADA') as 'AUTORIZADA' | 'RECHAZADA',
        deduped: false as const,
        estadoActual,
        solicitadoPorId: excepcion.solicitadoPorId,
      }
    })

    if (!result.deduped) {
      void notifyEvent('EXCEPCION_CREDITO_RESUELTA', {
        title: 'Excepción de crédito resuelta',
        body: result.estado === 'AUTORIZADA'
          ? 'La solicitud de excepción de crédito fue autorizada.'
          : 'La solicitud de excepción de crédito fue rechazada.',
      })
    }

    return result
  }
}
