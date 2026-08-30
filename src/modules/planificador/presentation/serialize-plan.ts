/**
 * Serializa un PlanDia (con grupos/paradas/actividades/excepciones) al shape que
 * consume la UI. `Decimal`/`Date` → `number`/ISO string (convención del proyecto).
 *
 * `nombres` (opcional): mapas id→nombre para cliente/negocio/trabajador, resueltos
 * por el caller (route). El plan solo guarda ids (ADR-PLANIFICADOR-002).
 */

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

type PlanConIncludes = Prisma.PlanDiaGetPayload<{
  include: {
    grupos: { include: { paradas: { include: { actividades: true } } } }
    excepciones: true
  }
}>

export interface NombresLookup {
  cliente: Record<string, string>
  negocio: Record<string, string>
  trabajador: Record<string, string>
}

/** Resuelve los nombres de cliente/negocio/trabajador referenciados por el plan. */
export async function resolverNombresPlan(plan: PlanConIncludes): Promise<NombresLookup> {
  const clienteIds = new Set<string>()
  const negocioIds = new Set<string>()
  const trabajadorIds = new Set<string>()

  for (const g of plan.grupos) {
    if (g.trabajadorPropuestoId) trabajadorIds.add(g.trabajadorPropuestoId)
    if (g.trabajadorFinalId) trabajadorIds.add(g.trabajadorFinalId)
    for (const p of g.paradas) {
      clienteIds.add(p.clienteId)
      if (p.negocioId) negocioIds.add(p.negocioId)
    }
  }
  for (const e of plan.excepciones) {
    const ent = e.entidad as { clienteId?: string } | null
    if (ent?.clienteId) clienteIds.add(ent.clienteId)
  }

  const [clientes, negocios, trabajadores] = await Promise.all([
    clienteIds.size
      ? prisma.cliente.findMany({ where: { id: { in: [...clienteIds] } }, select: { id: true, nombre: true } })
      : [],
    negocioIds.size
      ? prisma.negocio.findMany({ where: { id: { in: [...negocioIds] } }, select: { id: true, nombre: true } })
      : [],
    trabajadorIds.size
      ? prisma.trabajador.findMany({ where: { id: { in: [...trabajadorIds] } }, select: { id: true, nombre: true } })
      : [],
  ])

  return {
    cliente: Object.fromEntries(clientes.map((c) => [c.id, c.nombre])),
    negocio: Object.fromEntries(negocios.map((n) => [n.id, n.nombre])),
    trabajador: Object.fromEntries(trabajadores.map((t) => [t.id, t.nombre])),
  }
}

export function serializePlan(plan: PlanConIncludes, nombres?: NombresLookup) {
  const n = nombres ?? { cliente: {}, negocio: {}, trabajador: {} }
  return {
    id: plan.id,
    fecha: plan.fecha.toISOString().slice(0, 10),
    version: plan.version,
    estado: plan.estado,
    causa: plan.causa,
    resumen: plan.resumen,
    updatedAt: plan.updatedAt.toISOString(),
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
      trabajadorNombre: g.trabajadorFinalId
        ? n.trabajador[g.trabajadorFinalId] ?? null
        : g.trabajadorPropuestoId
          ? n.trabajador[g.trabajadorPropuestoId] ?? null
          : null,
      rutaId: g.rutaId,
      horaSalidaPropuesta: g.horaSalidaPropuesta,
      score: Number(g.score),
      distanciaKm: g.distanciaKm,
      explicacion: g.explicacion,
      embarqueId: g.embarqueId,
      paradas: g.paradas.map((p) => ({
        id: p.id,
        secuencia: p.secuencia,
        clienteId: p.clienteId,
        clienteNombre: n.cliente[p.clienteId] ?? null,
        negocioId: p.negocioId,
        negocioNombre: p.negocioId ? n.negocio[p.negocioId] ?? null : null,
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
