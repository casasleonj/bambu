/**
 * CrearRecoveryDecisionUseCase (FASE 4, ADR-RECUPERACION-001).
 *
 * Flujo SOBRANTE (contrato §4): LOCK(RECOVERY_SOURCE:sourceEventId) → resolver
 * EmbarqueMovimiento → determinar disponibilidad → sumar decisiones previas →
 * validar restante → crear RecoveryDecision → crear movimiento resultante → COMMIT.
 *
 * Flujo FALTANTE (contrato §4): NO sourceEventId → validar discrepancia → LOCK
 * del agregado afectado (embarque) → crear RecoveryDecision → COMMIT.
 */

import { withAdvisoryLock } from '@/lib/locks'
import { validarRecoveryDecision, type RecoveryTipo } from '../../domain/services/recovery.service'
import { incrementMetric } from '@/lib/metrics'

export interface CrearRecoveryDecisionInput {
  embarqueId: string
  tipo: RecoveryTipo
  sourceEventId?: string
  producto: string
  cantidad: number
  cantidadAplicada: number
  actorId: string
  authorizedById?: string
  reason: string
  pedidoOrigenId?: string
  pedidoDestinoId?: string
  offlineId?: string
}

export interface CrearRecoveryDecisionResult {
  decisionId: string
  deduped: boolean
}

export class CrearRecoveryDecisionUseCase {
  async execute(input: CrearRecoveryDecisionInput): Promise<CrearRecoveryDecisionResult> {
    // Validación pura común (independiente del lock).
    const errores = validarRecoveryDecision({
      tipo: input.tipo,
      cantidad: input.cantidad,
      cantidadAplicada: input.cantidadAplicada,
      sourceEventId: input.sourceEventId,
    })
    if (errores.length > 0) {
      throw new Error(errores.join('; '))
    }

    if (input.tipo === 'SOBRANTE') {
      return this.ejecutarSobrante(input)
    }
    return this.ejecutarFaltante(input)
  }

  private async ejecutarSobrante(input: CrearRecoveryDecisionInput): Promise<CrearRecoveryDecisionResult> {
    const sourceEventId = input.sourceEventId as string
    return withAdvisoryLock('RECOVERY_SOURCE', sourceEventId, async (tx) => {
      // Idempotencia (retry con el mismo offlineId → misma decisión).
      if (input.offlineId) {
        const existente = await tx.recoveryDecision.findUnique({
          where: { offlineId: input.offlineId },
        })
        if (existente) {
          return { decisionId: existente.id, deduped: true }
        }
      }

      // Resolver el movimiento físico de origen.
      const movimiento = await tx.embarqueMovimiento.findUnique({
        where: { id: sourceEventId },
      })
      if (!movimiento) {
        throw new Error('SOURCE_EVENT_NOT_FOUND')
      }

      // Disponibilidad física en el origen = cantidad del movimiento de origen.
      const cantidadDisponibleEnOrigen = movimiento.cantidad

      // Sumar cantidadAplicada de decisiones previas del MISMO source.
      const previas = await tx.recoveryDecision.aggregate({
        where: { sourceEventId },
        _sum: { cantidadAplicada: true },
      })
      const aplicadaPrevia = previas._sum.cantidadAplicada ?? 0
      const disponibleRestante = cantidadDisponibleEnOrigen - aplicadaPrevia

      if (input.cantidadAplicada > disponibleRestante) {
        // Métrica §24: doble consumo de un RecoveryDecision source rechazado.
        incrementMetric('recovery_decision_double_consumption_rejected_count')
        throw new Error('DOBLE_CONSUMO: excede el disponible restante del origen')
      }

      const decision = await tx.recoveryDecision.create({
        data: {
          embarqueId: input.embarqueId,
          sourceEventId,
          cantidadDisponibleEnOrigen,
          cantidad: input.cantidad,
          cantidadAplicada: input.cantidadAplicada,
          tipo: 'SOBRANTE',
          producto: input.producto,
          pedidoOrigenId: input.pedidoOrigenId ?? null,
          pedidoDestinoId: input.pedidoDestinoId ?? null,
          resultado: 'APLICADA',
          actorId: input.actorId,
          authorizedById: input.authorizedById ?? null,
          reason: input.reason,
          offlineId: input.offlineId ?? null,
        },
      })

      // Crear el movimiento físico resultante de la redistribución.
      await tx.embarqueMovimiento.create({
        data: {
          embarqueId: input.embarqueId,
          tipo: 'CUSTODY_TRANSFER',
          producto: input.producto,
          cantidad: input.cantidadAplicada,
          origen: 'INSPECCION',
          destino: 'ALMACEN',
          metadata: { recoveryDecisionId: decision.id },
        },
      })

      return { decisionId: decision.id, deduped: false }
    })
  }

  private async ejecutarFaltante(input: CrearRecoveryDecisionInput): Promise<CrearRecoveryDecisionResult> {
    // FALTANTE no tiene origen físico consumible: lock del agregado afectado
    // (el embarque).
    return withAdvisoryLock('EMBARQUE_CARGA', input.embarqueId, async (tx) => {
      if (input.offlineId) {
        const existente = await tx.recoveryDecision.findUnique({
          where: { offlineId: input.offlineId },
        })
        if (existente) {
          return { decisionId: existente.id, deduped: true }
        }
      }

      // FALTANTE no tiene sourceEventId (no hay evento físico de origen), pero
      // sigue necesitando protección contra doble consumo: sin esto, dos
      // decisiones sobre la MISMA discrepancia (mismo embarque/producto/
      // pedidoDestino) podrían resolverla dos veces. No hay un identificador
      // único de "discrepancia" en el schema actual, así que se usa
      // embarqueId+producto+pedidoDestinoId (ya bajo el lock EMBARQUE_CARGA)
      // como agrupación práctica, con `input.cantidad` de esta misma llamada
      // como techo declarado -- mismo patrón que SOBRANTE (sumar aplicado
      // previo, validar restante, rechazar si excede).
      const previasFaltante = await tx.recoveryDecision.aggregate({
        where: {
          embarqueId: input.embarqueId,
          producto: input.producto,
          tipo: 'FALTANTE',
          pedidoDestinoId: input.pedidoDestinoId ?? null,
        },
        _sum: { cantidadAplicada: true },
      })
      const aplicadaPreviaFaltante = previasFaltante._sum.cantidadAplicada ?? 0
      if (aplicadaPreviaFaltante + input.cantidadAplicada > input.cantidad) {
        incrementMetric('recovery_decision_double_consumption_rejected_count')
        throw new Error('DOBLE_CONSUMO: excede la cantidad declarada del faltante')
      }

      const decision = await tx.recoveryDecision.create({
        data: {
          embarqueId: input.embarqueId,
          sourceEventId: null,
          cantidadDisponibleEnOrigen: null,
          cantidad: input.cantidad,
          cantidadAplicada: input.cantidadAplicada,
          tipo: 'FALTANTE',
          producto: input.producto,
          pedidoOrigenId: input.pedidoOrigenId ?? null,
          pedidoDestinoId: input.pedidoDestinoId ?? null,
          resultado: 'APLICADA',
          actorId: input.actorId,
          authorizedById: input.authorizedById ?? null,
          reason: input.reason,
          offlineId: input.offlineId ?? null,
        },
      })

      return { decisionId: decision.id, deduped: false }
    })
  }
}
