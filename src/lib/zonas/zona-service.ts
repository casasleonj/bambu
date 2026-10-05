import type { Zona, ZonaBarrio, Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { normalizeZonaNombre } from './normalizer'
import { BarrioNoEncontradoError } from '@/lib/barrios/barrio-service'

/**
 * Servicio de Zona territorial (F3 del ALS/Plan Técnico Barrio/Zona/
 * Distribución).
 *
 * Contrato no negociable (ALS P2, §7): Zona↔Barrio es M:N. El solapamiento
 * (un Barrio en más de una Zona activa) es válido, pero NUNCA silencioso —
 * `agregarBarrioAZona` implementa el flujo de dos pasos del ALS §7-8:
 * detectar -> informar (`requires_confirmation`) -> confirmación explícita
 * del ADMIN (`confirmOverlap: true`) -> persistir. El backend recalcula el
 * solapamiento en cada llamada; nunca confía en un snapshot que la UI haya
 * mostrado antes.
 *
 * Toda mutación estructural (crear/renombrar/archivar/reactivar Zona,
 * agregar/quitar ZonaBarrio) corre dentro de `prisma.$transaction` con
 * `logAudit(..., tx)`: si la auditoría falla, la operación hace rollback
 * (ADR-CONCURRENCIA-001) — no se repite el patrón `logAudit(...).catch(() =>
 * {})` fuera de transacción usado en algunas rutas de Barrio.
 *
 * Fuera de alcance de F3: UX de solapamiento más allá del contrato de API
 * (F4), integración Cliente/Negocio (F5), integración Planificador (F6).
 */

type Db = PrismaClient | Prisma.TransactionClient

export const ZONA_BARRIO_SOURCES = ['USER', 'IMPORT', 'MIGRATION', 'SYSTEM', 'SYNC'] as const
export type ZonaBarrioSource = (typeof ZONA_BARRIO_SOURCES)[number]

export type ZonaConConteo = Zona & { _count: { barrios: number } }
export type ZonaResumen = Pick<Zona, 'id' | 'nombre'>

export class ZonaNoEncontradaError extends Error {
  constructor(id: string) {
    super(`Zona no encontrada: ${id}`)
    this.name = 'ZonaNoEncontradaError'
  }
}

export class ZonaBarrioNoEncontradoError extends Error {
  constructor(zonaId: string, barrioId: string) {
    super(`ZonaBarrio no encontrado: zona=${zonaId} barrio=${barrioId}`)
    this.name = 'ZonaBarrioNoEncontradoError'
  }
}

/**
 * Búsqueda para el listado administrativo (`/configuracion/zonas`).
 * Incluye el conteo de barrios vinculados (para "8 barrios · Activa").
 * Filtro determinista por substring sobre nombreNormalizado — NO fuzzy.
 */
export async function buscarZonas(
  query: string,
  opts: { incluirInactivas?: boolean; limit?: number } = {},
  db: Db = prisma,
): Promise<ZonaConConteo[]> {
  const { incluirInactivas = false, limit = 50 } = opts
  const nombreNormalizado = normalizeZonaNombre(query)

  return db.zona.findMany({
    where: {
      ...(incluirInactivas ? {} : { activo: true }),
      ...(nombreNormalizado ? { nombreNormalizado: { contains: nombreNormalizado } } : {}),
    },
    include: { _count: { select: { barrios: true } } },
    orderBy: { nombre: 'asc' },
    take: limit,
  })
}

/**
 * Detalle de una Zona con sus Barrios vinculados (para la vista de detalle
 * del admin: "Zona Norte -> Barrios de esta zona"). Cada Barrio incluye
 * `otrasZonas`: la vista inversa Barrio -> Zonas[] que el ALS exige desde
 * F3 (§7/§8.4) aunque la pantalla dedicada sea F4 — acá se usa para el
 * badge "Compartido · también en: X" directamente en la lista de barrios.
 */
export async function obtenerZonaConBarrios(id: string, db: Db = prisma) {
  const zona = await db.zona.findUnique({
    where: { id },
    include: {
      barrios: {
        include: { barrio: true },
        orderBy: { barrio: { nombre: 'asc' } },
      },
    },
  })
  if (!zona) return null

  const barrioIds = zona.barrios.map((b) => b.barrioId)
  const otrosVinculos = barrioIds.length
    ? await db.zonaBarrio.findMany({
        where: { barrioId: { in: barrioIds }, zonaId: { not: id }, zona: { activo: true } },
        include: { zona: { select: { id: true, nombre: true } } },
      })
    : []

  const otrasZonasPorBarrio = new Map<string, ZonaResumen[]>()
  for (const v of otrosVinculos) {
    const lista = otrasZonasPorBarrio.get(v.barrioId) ?? []
    lista.push(v.zona)
    otrasZonasPorBarrio.set(v.barrioId, lista)
  }

  return {
    ...zona,
    barrios: zona.barrios.map((b) => ({
      ...b,
      otrasZonas: otrasZonasPorBarrio.get(b.barrioId) ?? [],
    })),
  }
}

/**
 * Vista inversa Barrio -> Zonas[] (ALS §7/§8.4: la API/modelo deben
 * soportarla desde F3 aunque la pantalla dedicada sea F4). También es la
 * base del cálculo de solapamiento de `agregarBarrioAZona`.
 */
export async function obtenerZonasDeBarrio(
  barrioId: string,
  opts: { excluirZonaId?: string; soloActivas?: boolean } = {},
  db: Db = prisma,
): Promise<ZonaResumen[]> {
  const { excluirZonaId, soloActivas = false } = opts

  const vinculos = await db.zonaBarrio.findMany({
    where: {
      barrioId,
      ...(excluirZonaId ? { zonaId: { not: excluirZonaId } } : {}),
      ...(soloActivas ? { zona: { activo: true } } : {}),
    },
    include: { zona: { select: { id: true, nombre: true } } },
  })

  return vinculos.map((v) => v.zona)
}

/**
 * Crea una Zona nueva. NO valida unicidad de antemano (evita TOCTOU): la
 * constraint `@@unique([nombreNormalizado])` es la única fuente de verdad.
 * Auditoría atómica — si falla, la creación hace rollback.
 */
export async function crearZona(nombre: string, usuarioId: string | null): Promise<Zona> {
  const nombreTrim = nombre.trim()
  const nombreNormalizado = normalizeZonaNombre(nombreTrim)

  return prisma.$transaction(async (tx) => {
    const zona = await tx.zona.create({
      data: { nombre: nombreTrim, nombreNormalizado },
    })

    await logAudit(
      { entidad: 'Zona', registroId: zona.id, accion: 'CREATE', datos: { nombre: zona.nombre }, usuarioId },
      tx,
    )

    return zona
  })
}

/**
 * Renombra una Zona. A diferencia de Barrio, Zona no tiene columna legacy
 * espejo en Cliente/Negocio que sincronizar (no es la identidad territorial
 * que leen esos modelos) — el rename es una simple actualización + auditoría.
 */
export async function renombrarZona(id: string, nuevoNombre: string, usuarioId: string | null): Promise<Zona> {
  const nombreTrim = nuevoNombre.trim()
  const nombreNormalizado = normalizeZonaNombre(nombreTrim)

  return prisma.$transaction(async (tx) => {
    const existente = await tx.zona.findUnique({ where: { id } })
    if (!existente) throw new ZonaNoEncontradaError(id)

    const zona = await tx.zona.update({
      where: { id },
      data: { nombre: nombreTrim, nombreNormalizado },
    })

    await logAudit(
      {
        entidad: 'Zona',
        registroId: id,
        accion: 'UPDATE',
        datos: { cambios: { nombre: zona.nombre }, antes: { nombre: existente.nombre } },
        usuarioId,
      },
      tx,
    )

    return zona
  })
}

/**
 * Archiva una Zona (soft — nunca borrado físico, mismo criterio que Barrio
 * R10 del ALS). Los `ZonaBarrio` existentes NO se tocan: la FK
 * `ZonaBarrio.zonaId -> Zona.id` es `ON DELETE RESTRICT`, así que una Zona
 * con vínculos activos no puede borrarse físicamente ni por accidente;
 * archivar es la única operación de "retiro" soportada.
 */
export async function archivarZona(id: string, usuarioId: string | null): Promise<Zona> {
  return cambiarActivoZona(id, false, usuarioId)
}

export async function reactivarZona(id: string, usuarioId: string | null): Promise<Zona> {
  return cambiarActivoZona(id, true, usuarioId)
}

async function cambiarActivoZona(id: string, activo: boolean, usuarioId: string | null): Promise<Zona> {
  return prisma.$transaction(async (tx) => {
    const existente = await tx.zona.findUnique({ where: { id } })
    if (!existente) throw new ZonaNoEncontradaError(id)

    const zona = await tx.zona.update({ where: { id }, data: { activo } })

    await logAudit(
      { entidad: 'Zona', registroId: id, accion: activo ? 'RESTORE' : 'DELETE', datos: { activo }, usuarioId },
      tx,
    )

    return zona
  })
}

export type AgregarBarrioResultado =
  | { status: 'created'; zonaBarrio: ZonaBarrio; overlapDetected: boolean; existingZones: ZonaResumen[] }
  | { status: 'requires_confirmation'; overlapDetected: true; existingZones: ZonaResumen[] }

/**
 * Agrega un Barrio a una Zona implementando el contrato de solapamiento del
 * ALS §7-8: detectar -> informar -> confirmación explícita -> persistir.
 *
 * El solapamiento se recalcula SIEMPRE desde la DB en esta misma llamada
 * (nunca se confía en un `existingZones` que el cliente devuelva en el
 * body — no se lee del request). `confirmOverlap` es una intención
 * explícita del ADMIN sobre el estado ACTUAL, no sobre el estado que vio
 * la UI segundos antes.
 *
 * `source`/`createdBy` nunca llegan del cliente: `createdBy` sale de la
 * sesión autenticada (usuarioId) y `source` lo fija el caller de
 * confianza — la ruta HTTP de administración SIEMPRE pasa "USER"; los
 * demás valores (IMPORT/MIGRATION/SYSTEM/SYNC) son para futuros call-sites
 * internos (F4+), no para este endpoint.
 */
export async function agregarBarrioAZona(
  zonaId: string,
  barrioId: string,
  usuarioId: string | null,
  opts: { confirmOverlap?: boolean; source?: ZonaBarrioSource } = {},
): Promise<AgregarBarrioResultado> {
  const { confirmOverlap = false, source = 'USER' } = opts

  const zona = await prisma.zona.findUnique({ where: { id: zonaId } })
  if (!zona) throw new ZonaNoEncontradaError(zonaId)

  const barrio = await prisma.barrio.findUnique({ where: { id: barrioId } })
  if (!barrio) throw new BarrioNoEncontradoError(barrioId)

  const existingZones = await obtenerZonasDeBarrio(barrioId, { excluirZonaId: zonaId, soloActivas: true })

  if (existingZones.length > 0 && !confirmOverlap) {
    return { status: 'requires_confirmation', overlapDetected: true, existingZones }
  }

  return prisma.$transaction(async (tx) => {
    const zonaBarrio = await tx.zonaBarrio.create({
      data: { zonaId, barrioId, source, createdBy: usuarioId },
    })

    await logAudit(
      {
        entidad: 'ZonaBarrio',
        registroId: `${zonaId}:${barrioId}`,
        accion: 'CREATE',
        datos: {
          zonaId,
          zonaNombre: zona.nombre,
          barrioId,
          barrioNombre: barrio.nombre,
          source,
          overlapDetected: existingZones.length > 0,
          existingZonesAlConfirmar: existingZones,
          confirmadoPorAdmin: existingZones.length > 0 ? confirmOverlap : undefined,
        },
        usuarioId,
      },
      tx,
    )

    return { status: 'created', zonaBarrio, overlapDetected: existingZones.length > 0, existingZones }
  })
}

/**
 * Quita un Barrio de una Zona. Borrado físico del vínculo (no del Barrio ni
 * de la Zona — ambos protegidos aparte por su propio soft-delete y por la
 * FK `ON DELETE RESTRICT`). La historia queda en `Historial` vía
 * `logAudit`, atómica con el delete.
 */
export async function quitarBarrioDeZona(
  zonaId: string,
  barrioId: string,
  usuarioId: string | null,
): Promise<{ zonasRestantes: ZonaResumen[] }> {
  return prisma.$transaction(async (tx) => {
    const existente = await tx.zonaBarrio.findUnique({
      where: { zonaId_barrioId: { zonaId, barrioId } },
    })
    if (!existente) throw new ZonaBarrioNoEncontradoError(zonaId, barrioId)

    await tx.zonaBarrio.delete({ where: { zonaId_barrioId: { zonaId, barrioId } } })

    const zonasRestantes = await obtenerZonasDeBarrio(barrioId, { excluirZonaId: zonaId }, tx)

    await logAudit(
      {
        entidad: 'ZonaBarrio',
        registroId: `${zonaId}:${barrioId}`,
        accion: 'DELETE',
        datos: { zonaId, barrioId, zonasRestantes },
        usuarioId,
      },
      tx,
    )

    return { zonasRestantes }
  })
}
