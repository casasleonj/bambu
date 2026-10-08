import type { Barrio, BarrioAlias, BarrioReferencia, Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { normalizeBarrioNombre } from './normalizer'
import { BarrioNoEncontradoError } from './barrio-service'

/**
 * Servicio de alias y referencias territoriales de Barrio (F4, fase separada
 * de F1/F3 — ver comentarios en `schema.prisma` para la semántica completa).
 *
 * Regla fundamental (equipo, revisión 2026-10-07):
 *   "Alias identifica. Referencia ayuda a ubicar. Un texto que termina
 *    apuntando a más de un Barrio nunca se resuelve automáticamente."
 *
 * `resolverBarrioPorTexto` consulta SIEMPRE las 3 fuentes (nombre canónico,
 * alias, referencia) y consolida por `barrioId` — nunca retorna en el
 * primer match por prioridad. La prioridad (nombre > alias > referencia)
 * solo sirve para etiquetar `matchedVia` cuando hay un único Barrio
 * candidato, nunca para decidir cuál gana si hay varios.
 */

type Db = PrismaClient | Prisma.TransactionClient

export class ConflictoTerritorialError extends Error {
  constructor(
    public readonly detalle: string,
    public readonly barrioConflicto: { id: string; nombre: string },
  ) {
    super(detalle)
    this.name = 'ConflictoTerritorialError'
  }
}

export class ReferenciaRedundanteError extends Error {
  constructor(detalle: string) {
    super(detalle)
    this.name = 'ReferenciaRedundanteError'
  }
}

export class AliasNoEncontradoError extends Error {
  constructor(id: string) {
    super(`Alias de barrio no encontrado: ${id}`)
    this.name = 'AliasNoEncontradoError'
  }
}

export class ReferenciaNoEncontradaError extends Error {
  constructor(id: string) {
    super(`Referencia de barrio no encontrada: ${id}`)
    this.name = 'ReferenciaNoEncontradaError'
  }
}

export type MatchedVia = 'nombre' | 'alias' | 'referencia'

export type ResolverCandidato = { barrio: Barrio; matchedVia: MatchedVia[] }

export type ResolverResultado =
  | { estado: 'NO_ENCONTRADO' }
  | { estado: 'ENCONTRADO'; barrio: Barrio; matchedVia: MatchedVia }
  | { estado: 'AMBIGUO'; candidatos: ResolverCandidato[] }

const PRIORIDAD_DISPLAY: MatchedVia[] = ['nombre', 'alias', 'referencia']

/**
 * Resolución exacta y determinista de un texto hacia su Barrio. Nunca
 * fuzzy, nunca por prioridad: consulta Barrio.nombreNormalizado,
 * BarrioAlias.textoNormalizado y BarrioReferencia.textoNormalizado en
 * paralelo, consolida por `barrioId` y SOLO entonces decide:
 *   - 0 barrios distintos → NO_ENCONTRADO
 *   - 1 barrio distinto   → ENCONTRADO (aunque haya matcheado por varias
 *     fuentes a la vez — eso es convergencia válida, no ambigüedad)
 *   - >1 barrios distintos → AMBIGUO (nunca se elige en silencio)
 */
export async function resolverBarrioPorTexto(texto: string, db: Db = prisma): Promise<ResolverResultado> {
  const textoNormalizado = normalizeBarrioNombre(texto)
  if (!textoNormalizado) return { estado: 'NO_ENCONTRADO' }

  const [canonico, aliases, referencias] = await Promise.all([
    db.barrio.findUnique({ where: { nombreNormalizado: textoNormalizado } }),
    db.barrioAlias.findMany({ where: { textoNormalizado }, include: { barrio: true } }),
    db.barrioReferencia.findMany({ where: { textoNormalizado }, include: { barrio: true } }),
  ])

  const porBarrio = new Map<string, ResolverCandidato>()
  const registrar = (barrio: Barrio, via: MatchedVia) => {
    const existente = porBarrio.get(barrio.id)
    if (existente) {
      if (!existente.matchedVia.includes(via)) existente.matchedVia.push(via)
    } else {
      porBarrio.set(barrio.id, { barrio, matchedVia: [via] })
    }
  }

  if (canonico) registrar(canonico, 'nombre')
  for (const a of aliases) registrar(a.barrio, 'alias')
  for (const r of referencias) registrar(r.barrio, 'referencia')

  const candidatos = [...porBarrio.values()]

  if (candidatos.length === 0) return { estado: 'NO_ENCONTRADO' }

  if (candidatos.length === 1) {
    const [unico] = candidatos
    const matchedVia = PRIORIDAD_DISPLAY.find((v) => unico.matchedVia.includes(v)) ?? 'referencia'
    return { estado: 'ENCONTRADO', barrio: unico.barrio, matchedVia }
  }

  return { estado: 'AMBIGUO', candidatos }
}

/**
 * Crea un Alias. Bloqueo duro (ConflictoTerritorialError) si el texto ya
 * identifica o apunta territorialmente a OTRO Barrio — nunca confirmable,
 * a diferencia del contrato de solapamiento de Zona. Las 3 fuentes se
 * chequean explícitamente (canónico, alias, referencia); la colisión
 * alias↔alias la garantiza además la unique constraint de DB (P2002) como
 * defensa en profundidad contra condiciones de carrera.
 */
export async function crearAlias(
  barrioId: string,
  texto: string,
  usuarioId: string,
): Promise<BarrioAlias> {
  const textoTrim = texto.trim()
  const textoNormalizado = normalizeBarrioNombre(textoTrim)

  return prisma.$transaction(async (tx) => {
    const barrio = await tx.barrio.findUnique({ where: { id: barrioId } })
    if (!barrio) throw new BarrioNoEncontradoError(barrioId)

    if (barrio.nombreNormalizado === textoNormalizado) {
      throw new ReferenciaRedundanteError('Ese texto ya es el nombre del barrio.')
    }

    const [canonicoConflicto, aliasPropio, referenciaConflicto] = await Promise.all([
      tx.barrio.findUnique({ where: { nombreNormalizado: textoNormalizado } }),
      tx.barrioAlias.findFirst({ where: { barrioId, textoNormalizado } }),
      tx.barrioReferencia.findFirst({
        where: { textoNormalizado, barrioId: { not: barrioId } },
        include: { barrio: true },
      }),
    ])

    if (canonicoConflicto) {
      throw new ConflictoTerritorialError(
        `"${textoTrim}" ya es el nombre del barrio "${canonicoConflicto.nombre}".`,
        { id: canonicoConflicto.id, nombre: canonicoConflicto.nombre },
      )
    }
    if (aliasPropio) {
      throw new ReferenciaRedundanteError('Ese alias ya está registrado para este barrio.')
    }
    if (referenciaConflicto) {
      throw new ConflictoTerritorialError(
        `"${textoTrim}" ya es una referencia del barrio "${referenciaConflicto.barrio.nombre}".`,
        { id: referenciaConflicto.barrio.id, nombre: referenciaConflicto.barrio.nombre },
      )
    }

    const alias = await tx.barrioAlias.create({
      data: { barrioId, texto: textoTrim, textoNormalizado },
    })

    await logAudit(
      {
        entidad: 'BarrioAlias',
        registroId: alias.id,
        accion: 'CREATE',
        datos: { barrioId, barrioNombre: barrio.nombre, texto: textoTrim },
        usuarioId,
      },
      tx,
    )

    return alias
  })
}

/**
 * Crea una Referencia. A diferencia de Alias, NO bloquea contra otros
 * Barrios (una referencia puede compartirse legítimamente — ej. futuro "La
 * Cancha" en dos barrios). Solo evita redundancia DENTRO del mismo Barrio:
 * si el texto ya es su nombre canónico, su propio alias, o ya está
 * registrado como su propia referencia (esto último vía unique constraint).
 */
export async function crearReferencia(
  barrioId: string,
  texto: string,
  usuarioId: string,
): Promise<BarrioReferencia> {
  const textoTrim = texto.trim()
  const textoNormalizado = normalizeBarrioNombre(textoTrim)

  return prisma.$transaction(async (tx) => {
    const barrio = await tx.barrio.findUnique({ where: { id: barrioId } })
    if (!barrio) throw new BarrioNoEncontradoError(barrioId)

    if (barrio.nombreNormalizado === textoNormalizado) {
      throw new ReferenciaRedundanteError('Esta forma de ubicar el barrio ya está registrada (es su nombre).')
    }

    const aliasPropio = await tx.barrioAlias.findFirst({ where: { barrioId, textoNormalizado } })
    if (aliasPropio) {
      throw new ReferenciaRedundanteError('Esta forma de ubicar el barrio ya está registrada (es un alias).')
    }

    const referencia = await tx.barrioReferencia.create({
      data: { barrioId, texto: textoTrim, textoNormalizado },
    })

    await logAudit(
      {
        entidad: 'BarrioReferencia',
        registroId: referencia.id,
        accion: 'CREATE',
        datos: { barrioId, barrioNombre: barrio.nombre, texto: textoTrim },
        usuarioId,
      },
      tx,
    )

    return referencia
  })
}

/**
 * `barrioId` cruza pertenencia (mismo patrón que `quitarBarrioDeZona` y
 * los sub-endpoints de `ContactoCliente`): si el alias existe pero no
 * pertenece a ESE Barrio, se trata igual que "no existe" — nunca se filtra
 * por la URL si un alias pertenece a otro Barrio.
 */
export async function eliminarAlias(barrioId: string, id: string, usuarioId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const alias = await tx.barrioAlias.findUnique({ where: { id }, include: { barrio: true } })
    if (!alias || alias.barrioId !== barrioId) throw new AliasNoEncontradoError(id)

    await tx.barrioAlias.delete({ where: { id } })

    await logAudit(
      {
        entidad: 'BarrioAlias',
        registroId: id,
        accion: 'DELETE',
        datos: { barrioId: alias.barrioId, barrioNombre: alias.barrio.nombre, texto: alias.texto },
        usuarioId,
      },
      tx,
    )
  })
}

export async function eliminarReferencia(barrioId: string, id: string, usuarioId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const referencia = await tx.barrioReferencia.findUnique({ where: { id }, include: { barrio: true } })
    if (!referencia || referencia.barrioId !== barrioId) throw new ReferenciaNoEncontradaError(id)

    await tx.barrioReferencia.delete({ where: { id } })

    await logAudit(
      {
        entidad: 'BarrioReferencia',
        registroId: id,
        accion: 'DELETE',
        datos: { barrioId: referencia.barrioId, barrioNombre: referencia.barrio.nombre, texto: referencia.texto },
        usuarioId,
      },
      tx,
    )
  })
}
