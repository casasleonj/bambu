/**
 * ResolverResponsibilityCaseUseCase (FASE 6, ADR-RESPONSABILIDAD-001).
 *
 * Contrato §13: la detección es automática, pero la transferencia económica al
 * trabajador NUNCA es automática. La resolución exige workflow:
 *
 *   RESUELTA_SIN_CARGO  → marca resuelta, sin cargo (resueltoPorId).
 *   RESUELTA_CON_CARGO  → exige autorizadoPorId + resueltoPorId obligatorios y
 *                         materializa el hecho económico (DescuentoRepartidor o
 *                         DeudaTrabajador) según el tipo del caso.
 *
 * `resueltoPorId` por sí solo NO autoriza un cargo.
 *
 * Idempotencia: un caso ya resuelto retorna deduped:true sin re-materializar el
 * cargo (previene doble cargo por dos autorizaciones concurrentes).
 */

import { withAdvisoryLock } from '@/lib/locks'
import { incrementMetric } from '@/lib/metrics'

export interface ResolverResponsibilityCaseInput {
  caseId: string
  resolucion: 'SIN_CARGO' | 'CON_CARGO'
  resueltoPorId: string
  autorizadoPorId?: string
  motivo?: string
}

export interface ResolverResponsibilityCaseResult {
  caseId: string
  hechoEconomicoId?: string
  deduped: boolean
}

export class ResolverResponsibilityCaseUseCase {
  async execute(input: ResolverResponsibilityCaseInput): Promise<ResolverResponsibilityCaseResult> {
    // FASE 6: la resolución de responsabilidad es infrecuente; se serializa
    // globalmente. El lock granular por caso se define en un ADR futuro (no
    // hay namespace RESPONSIBILITY en el contrato §6).
    return withAdvisoryLock('SECUENCIA', 'responsibility', async (tx) => {
      const caso = await tx.responsibilityCase.findUnique({
        where: { id: input.caseId },
      })
      if (!caso) {
        throw new Error('RESPONSIBILITY_CASE_NOT_FOUND')
      }

      // Métrica §24: investigación de responsabilidad sin embarque activo.
      if (!caso.embarqueId) {
        incrementMetric('responsibility_case_without_embarque_count')
      }

      // Idempotencia: ya resuelto/cerrado → no re-materializar el cargo.
      if (['RESUELTA_SIN_CARGO', 'RESUELTA_CON_CARGO', 'CERRADA'].includes(caso.estado)) {
        return {
          caseId: caso.id,
          hechoEconomicoId: caso.hechoEconomicoId ?? undefined,
          deduped: true,
        }
      }

      if (input.resolucion === 'SIN_CARGO') {
        await tx.responsibilityCase.update({
          where: { id: caso.id },
          data: {
            estado: 'RESUELTA_SIN_CARGO',
            resueltoPorId: input.resueltoPorId,
            resueltoAt: new Date(),
          },
        })
        return { caseId: caso.id, deduped: false }
      }

      // CON_CARGO: §13 exige autorizadoPorId + resueltoPorId.
      if (!input.autorizadoPorId) {
        throw new Error('RESUELTA_CON_CARGO_EXIGE_AUTORIZACION')
      }
      if (!input.resueltoPorId) {
        throw new Error('RESUELTA_CON_CARGO_EXIGE_RESOLUTOR')
      }
      if (!caso.trabajadorId) {
        throw new Error('RESPONSIBILITY_CASE_SIN_TRABAJADOR')
      }

      let hechoEconomicoId: string | undefined
      let hechoEconomicoTipo: string | undefined

      if (caso.tipo === 'DISCREPANCIA_INVENTARIO') {
        // El DescuentoRepartidor legacy exige embarqueId.
        if (!caso.embarqueId) {
          throw new Error('DESCUENTO_EXIGE_EMBARQUE')
        }
        const descuento = await tx.descuentoRepartidor.create({
          data: {
            embarqueId: caso.embarqueId,
            trabajadorId: caso.trabajadorId,
            monto: Number(caso.montoEstimado ?? 0),
            motivo: caso.descripcion,
            justificado: false,
          },
        })
        hechoEconomicoId = descuento.id
        hechoEconomicoTipo = 'DESCUENTO'
      } else {
        // FALTANTE_CAJA / FIADO_NO_COBRADO → DeudaTrabajador (embarqueId nullable).
        const deuda = await tx.deudaTrabajador.create({
          data: {
            createdById: input.resueltoPorId,
            trabajadorId: caso.trabajadorId,
            tipo: 'DEFICIT_EFECTIVO',
            montoOriginal: Number(caso.montoEstimado ?? 0),
            montoPendiente: Number(caso.montoEstimado ?? 0),
            embarqueId: caso.embarqueId ?? undefined,
            descripcion: caso.descripcion,
          },
        })
        hechoEconomicoId = deuda.id
        hechoEconomicoTipo = 'DEUDA'
      }

      await tx.responsibilityCase.update({
        where: { id: caso.id },
        data: {
          estado: 'RESUELTA_CON_CARGO',
          autorizadoPorId: input.autorizadoPorId,
          resueltoPorId: input.resueltoPorId,
          resueltoAt: new Date(),
          hechoEconomicoId,
          hechoEconomicoTipo,
        },
      })

      return { caseId: caso.id, hechoEconomicoId, deduped: false }
    })
  }
}
