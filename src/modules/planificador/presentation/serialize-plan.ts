/**
 * Serializa un PlanDia (con grupos/paradas/actividades/excepciones) al shape que
 * consume la UI. `Decimal`/`Date` → `number`/ISO string (convención del proyecto).
 */

import type { Prisma } from '@prisma/client'

type PlanConIncludes = Prisma.PlanDiaGetPayload<{
  include: {
    grupos: { include: { paradas: { include: { actividades: true } } } }
    excepciones: true
  }
}>

export function serializePlan(plan: PlanConIncludes) {
  return {
    id: plan.id,
    fecha: plan.fecha.toISOString().slice(0, 10),
    version: plan.version,
    estado: plan.estado,
    causa: plan.causa,
    resumen: plan.resumen,
    generadoEn: plan.generadoEn.toISOString(),
    confirmadoEn: plan.confirmadoEn?.toISOString() ?? null,
    grupos: plan.grupos.map((g) => ({
      id: g.id,
      nombreLogico: g.nombreLogico,
      secuencia: g.secuencia,
      capacidadUnidades: g.capacidadUnidades,
      cargaPlanificada: g.cargaPlanificada,
      trabajadorPropuestoId: g.trabajadorPropuestoId,
      trabajadorFinalId: g.trabajadorFinalId,
      rutaId: g.rutaId,
      horaSalidaPropuesta: g.horaSalidaPropuesta,
      score: Number(g.score),
      explicacion: g.explicacion,
      embarqueId: g.embarqueId,
      paradas: g.paradas.map((p) => ({
        id: p.id,
        secuencia: p.secuencia,
        clienteId: p.clienteId,
        negocioId: p.negocioId,
        ubicacionUsada: p.ubicacionUsada,
        motivo: p.motivo,
        actividades: p.actividades.map((a) => ({
          id: a.id,
          tipo: a.tipo,
          pedidoIds: a.pedidoIds,
          snapshotCantidades: a.snapshotCantidades,
        })),
      })),
    })),
    excepciones: plan.excepciones.map((e) => ({
      id: e.id,
      tipo: e.tipo,
      severidad: e.severidad,
      entidad: e.entidad,
      explicacion: e.explicacion,
      opciones: e.opciones,
      estado: e.estado,
    })),
  }
}
