import type { Barrio, Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { normalizeBarrioNombre } from './normalizer'

/**
 * Servicio de Barrio canónico (F1 del ALS Barrio/Zona).
 *
 * Alcance deliberadamente mínimo (ajuste aprobado sobre el plan original):
 *  - normalización determinista, sin fuzzy matching ni pg_trgm;
 *  - sin estados SAFE_MATCH/AMBIGUOUS/UNMATCHED (eso es F2, migración masiva);
 *  - la unicidad la garantiza la constraint de DB (`@@unique([nombreNormalizado])`),
 *    no una comprobación previa aquí — este módulo no reemplaza esa garantía,
 *    solo evita round-trips innecesarios cuando es obvio que ya existe.
 *
 * Fuera de alcance: Zona, ZonaBarrio, Municipio, integración con el
 * planificador/route-analysis.ts (que siguen leyendo el string legacy
 * `barrio`, sincronizado por este servicio en rename).
 */

type Db = PrismaClient | Prisma.TransactionClient

export class BarrioNoEncontradoError extends Error {
  constructor(id: string) {
    super(`Barrio no encontrado: ${id}`)
    this.name = 'BarrioNoEncontradoError'
  }
}

/**
 * Búsqueda exacta por nombre normalizado. Devuelve el Barrio exista o no
 * `activo` — el caller decide qué hacer con un match archivado (p.ej.
 * ofrecer "reactivar" en vez de crear un duplicado, que además la DB
 * rechazaría por la unique constraint).
 */
export async function buscarBarrioExacto(nombre: string, db: Db = prisma): Promise<Barrio | null> {
  const nombreNormalizado = normalizeBarrioNombre(nombre)
  if (!nombreNormalizado) return null
  return db.barrio.findUnique({ where: { nombreNormalizado } })
}

export type BarrioConConteo = Barrio & {
  _count: { clientes: number; negocios: number }
  /** Texto de un BarrioAlias que matcheó el query (F4) — p.ej. "Antillana". */
  aliasCoincidente?: string
  /** Textos de BarrioReferencia que matchearon el query (F4) — p.ej. ["Antillana 2"]. */
  referenciasCoincidentes?: string[]
}

/**
 * Búsqueda para el selector (autocomplete) y para la administración del
 * catálogo. Filtro determinista por substring — NO es fuzzy matching (no
 * hay scoring de similaridad ni umbral de confianza).
 *
 * F4: el substring busca también sobre BarrioAlias/BarrioReferencia
 * (`buscarBarrios("antill")` encuentra "La Antillana" por su alias
 * "Antillana" o sus referencias "Antillana 1"/"Antillana 2"), consolidado
 * por Barrio — un Barrio aparece UNA sola vez aunque matchee por varias
 * fuentes a la vez (lo garantiza el filtro relacional `some`, sin join
 * manual). `aliasCoincidente`/`referenciasCoincidentes` llevan el texto que
 * matcheó, para que la UI explique "Coincide con: X" sin que el caller
 * tenga que re-normalizar ni adivinar.
 *
 * Incluye el conteo de Cliente/Negocio vinculados (`_count`) — útil para
 * que un ADMIN distinga, al administrar el catálogo, un Barrio con
 * registros reales de uno vacío/candidato a duplicado (la detección y el
 * saneamiento de duplicados en sí son trabajo aparte, no de este módulo).
 */
export async function buscarBarrios(
  query: string,
  opts: { incluirInactivos?: boolean; limit?: number } = {},
  db: Db = prisma,
): Promise<BarrioConConteo[]> {
  const { incluirInactivos = false, limit = 20 } = opts
  const nombreNormalizado = normalizeBarrioNombre(query)

  if (!nombreNormalizado) {
    return db.barrio.findMany({
      where: incluirInactivos ? {} : { activo: true },
      include: { _count: { select: { clientes: true, negocios: true } } },
      orderBy: { nombre: 'asc' },
      take: limit,
    })
  }

  const barrios = await db.barrio.findMany({
    where: {
      ...(incluirInactivos ? {} : { activo: true }),
      OR: [
        { nombreNormalizado: { contains: nombreNormalizado } },
        { aliases: { some: { textoNormalizado: { contains: nombreNormalizado } } } },
        { referencias: { some: { textoNormalizado: { contains: nombreNormalizado } } } },
      ],
    },
    include: {
      _count: { select: { clientes: true, negocios: true } },
      aliases: { where: { textoNormalizado: { contains: nombreNormalizado } }, select: { texto: true } },
      referencias: { where: { textoNormalizado: { contains: nombreNormalizado } }, select: { texto: true } },
    },
    orderBy: { nombre: 'asc' },
    take: limit,
  })

  return barrios.map(({ aliases, referencias, ...resto }) => ({
    ...resto,
    ...(aliases.length ? { aliasCoincidente: aliases[0].texto } : {}),
    ...(referencias.length ? { referenciasCoincidentes: referencias.map((r) => r.texto) } : {}),
  }))
}

/**
 * Crea un Barrio nuevo. NO valida unicidad de antemano (evitaría una
 * carrera TOCTOU): la constraint `@@unique([nombreNormalizado])` es la
 * única fuente de verdad — si ya existe (activo o archivado), Prisma lanza
 * `PrismaClientKnownRequestError` con code `P2002`, que el caller (route)
 * debe traducir a 409.
 */
export async function crearBarrio(nombre: string, db: Db = prisma): Promise<Barrio> {
  const nombreTrim = nombre.trim()
  return db.barrio.create({
    data: {
      nombre: nombreTrim,
      nombreNormalizado: normalizeBarrioNombre(nombreTrim),
    },
  })
}

/**
 * Renombra un Barrio y sincroniza el string legacy `barrio` en todos los
 * Cliente/Negocio vinculados por `barrioId` — atómico (misma transacción),
 * para que nunca quede una representación legacy desactualizada respecto
 * al nombre canónico (regla de autoridad aprobada para F1).
 *
 * El `id` es permanente; solo cambian `nombre`/`nombreNormalizado`.
 */
export async function renombrarBarrio(
  id: string,
  nuevoNombre: string,
): Promise<{ barrio: Barrio; clientesSincronizados: number; negociosSincronizados: number }> {
  const nombreTrim = nuevoNombre.trim()
  const nombreNormalizado = normalizeBarrioNombre(nombreTrim)

  return prisma.$transaction(async (tx) => {
    const existente = await tx.barrio.findUnique({ where: { id } })
    if (!existente) throw new BarrioNoEncontradoError(id)

    const barrio = await tx.barrio.update({
      where: { id },
      data: { nombre: nombreTrim, nombreNormalizado },
    })

    const clientesSincronizados = await tx.cliente.updateMany({
      where: { barrioId: id },
      data: { barrio: nombreTrim },
    })
    const negociosSincronizados = await tx.negocio.updateMany({
      where: { barrioId: id },
      data: { barrio: nombreTrim },
    })

    return {
      barrio,
      clientesSincronizados: clientesSincronizados.count,
      negociosSincronizados: negociosSincronizados.count,
    }
  })
}

/**
 * Archiva un Barrio (soft — nunca borrado físico, per R10 del ALS). Los
 * Cliente/Negocio que lo referencian mantienen su `barrioId` intacto: un
 * Barrio archivado sigue siendo una identidad válida para lo ya vinculado,
 * simplemente deja de ofrecerse en el selector de nuevos vínculos.
 */
export async function archivarBarrio(id: string, db: Db = prisma): Promise<Barrio> {
  const existente = await db.barrio.findUnique({ where: { id } })
  if (!existente) throw new BarrioNoEncontradoError(id)
  return db.barrio.update({ where: { id }, data: { activo: false } })
}

export async function reactivarBarrio(id: string, db: Db = prisma): Promise<Barrio> {
  const existente = await db.barrio.findUnique({ where: { id } })
  if (!existente) throw new BarrioNoEncontradoError(id)
  return db.barrio.update({ where: { id }, data: { activo: true } })
}

/**
 * Resuelve un `barrioId` recibido en un POST/PUT de Cliente o Negocio hacia
 * su Barrio canónico, para el dual-write (barrioId → Barrio.nombre →
 * Cliente/Negocio.barrio). Lanza `BarrioNoEncontradoError` si la referencia
 * es inválida — nunca se acepta un `barrioId` fantasma en silencio.
 */
export async function resolverBarrioParaVinculo(barrioId: string, db: Db = prisma): Promise<Barrio> {
  const barrio = await db.barrio.findUnique({ where: { id: barrioId } })
  if (!barrio) throw new BarrioNoEncontradoError(barrioId)
  return barrio
}
