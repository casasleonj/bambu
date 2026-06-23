import { Prisma, type PrismaClient } from '@prisma/client'
import { normalizeName, normalizeString } from './normalizer'
import type { ImportMatchCandidate, MatchTargetPreview, NormalizedCliente } from './types'

/**
 * Detección de duplicados de clientes durante la importación histórica.
 *
 * Estrategia:
 *  1. Teléfono exacto (cliente o contactos) → score 1.0, auto-merge.
 *  2. Nombre + barrio normalizados idénticos → score 0.95, auto-merge.
 *  3. pg_trgm similarity ≥ 0.7 + (mismo barrio | mismo último-4-tel | contacto) → revisión.
 *  4. Resto → no es candidato.
 */

export const WORKER_PAYMENT_KEYWORDS = [
  'nomina',
  'nómina',
  'sueldo',
  'salario',
  'pago repartidor',
  'pago personal',
  'pago trabajador',
  'pago empleado',
  'pago sellador',
  'pago empacador',
  'comision',
  'comisión',
  'bono',
  'bonificación',
  'bonificacion',
  'liquidacion',
  'liquidación',
  'viatico',
  'viático',
  'adelanto',
  'anticipo',
  'pago nómina',
  'pago nomina',
]

export interface MatchOptions {
  /** Similaridad mínima de pg_trgm para considerar candidato. */
  trigramThreshold: number
  /** Número máximo de candidatos a retornar. */
  maxCandidates: number
}

export const DEFAULT_MATCH_OPTIONS: MatchOptions = {
  trigramThreshold: 0.7,
  maxCandidates: 3,
}

interface DbMatchRow {
  id: string
  nombre: string
  apellido: string | null
  telefono: string
  direccion: string | null
  barrio: string | null
  nombreNegocio: string | null
  similarity: number
  isPhoneMatch: number
}

export async function findClientMatches(
  tx: PrismaClient | Prisma.TransactionClient,
  cliente: NormalizedCliente,
  options: MatchOptions = DEFAULT_MATCH_OPTIONS
): Promise<ImportMatchCandidate[]> {
  const candidates = await queryClientCandidates(tx, cliente, options.trigramThreshold)
  const scored = candidates
    .map((row) => scoreClientMatch(cliente, row))
    .filter((c) => c.score >= options.trigramThreshold || c.score >= 1.0)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.maxCandidates)

  return deduplicateCandidates(scored)
}

async function queryClientCandidates(
  tx: PrismaClient | Prisma.TransactionClient,
  cliente: NormalizedCliente,
  threshold: number
): Promise<DbMatchRow[]> {
  const query = Prisma.sql`
    SELECT
      c.id,
      c.nombre,
      c.apellido,
      c.telefono,
      c.direccion,
      c.barrio,
      c."nombreNegocio",
      GREATEST(
        similarity(${cliente.nombre}, c.nombre),
        similarity(${cliente.nombre}, COALESCE(c.apellido, ''))
      ) AS similarity,
      CASE
        WHEN c.telefono = ${cliente.telefono} THEN 1
        WHEN EXISTS (
          SELECT 1 FROM "ContactoCliente" cc
          WHERE cc."clienteId" = c.id AND cc.telefono = ${cliente.telefono}
        ) THEN 1
        ELSE 0
      END AS "isPhoneMatch"
    FROM "Cliente" c
    WHERE c.activo = true
      AND (
        c.telefono = ${cliente.telefono}
        OR EXISTS (
          SELECT 1 FROM "ContactoCliente" cc
          WHERE cc."clienteId" = c.id AND cc.telefono = ${cliente.telefono}
        )
        OR GREATEST(
          similarity(${cliente.nombre}, c.nombre),
          similarity(${cliente.nombre}, COALESCE(c.apellido, ''))
        ) >= ${threshold}
      )
    ORDER BY "isPhoneMatch" DESC, similarity DESC
    LIMIT 20
  `

  return tx.$queryRaw<DbMatchRow[]>(query)
}

export function scoreClientMatch(
  cliente: NormalizedCliente,
  existing: DbMatchRow
): ImportMatchCandidate {
  const reasons: string[] = []
  let score = 0

  const existingFullName = normalizeName(`${existing.nombre} ${existing.apellido ?? ''}`).trim()
  const inputFullName = normalizeName(`${cliente.nombre} ${cliente.apellido ?? ''}`).trim()
  // Bloque 1: teléfono exacto (cliente o contacto)
  if (existing.isPhoneMatch === 1 || existing.telefono === cliente.telefono) {
    score = Math.max(score, 1.0)
    reasons.push('TELÉFONO IDÉNTICO')
  }

  const existingPhoneLast4 = last4(existing.telefono)
  const inputPhoneLast4 = last4(cliente.telefono)

  // Bloque 2: nombre + barrio idénticos
  const sameName = existingFullName === inputFullName && inputFullName.length > 3
  const sameBarrio =
    !!cliente.barrio &&
    !!existing.barrio &&
    normalizeString(cliente.barrio).toLowerCase() === normalizeString(existing.barrio).toLowerCase()

  if (sameName && sameBarrio) {
    score = Math.max(score, 0.95)
    reasons.push('NOMBRE Y BARRIO IDÉNTICOS')
  }

  // Bloque 3: fuzzy con pg_trgm + reforzadores
  const nameSimilarity = Math.max(
    similarity(existing.nombre, cliente.nombre),
    similarity(existing.apellido ?? '', cliente.nombre),
    similarity(existing.nombre, `${cliente.nombre} ${cliente.apellido ?? ''}`)
  )

  if (nameSimilarity >= 0.7) {
    let fuzzyScore = nameSimilarity
    if (sameBarrio) fuzzyScore += 0.1
    if (inputPhoneLast4 && existingPhoneLast4 && inputPhoneLast4 === existingPhoneLast4) {
      fuzzyScore += 0.1
      reasons.push('ÚLTIMOS 4 DÍGITOS DEL TELÉFONO COINCIDEN')
    }
    if (sameBarrio) reasons.push('MISMO BARRIO')

    score = Math.max(score, Math.min(fuzzyScore, 0.94))
    reasons.push(`NOMBRE PARECIDO (${Math.round(nameSimilarity * 100)}%)`)
  }

  const target: MatchTargetPreview = {
    id: existing.id,
    nombre: [existing.nombre, existing.apellido].filter(Boolean).join(' '),
    telefono: existing.telefono,
    direccion: existing.direccion,
    barrio: existing.barrio,
    nombreNegocio: existing.nombreNegocio,
  }

  return {
    targetId: existing.id,
    score: Math.min(score, 1.0),
    reason: reasons.join(' + ') || 'SIMILITUD GENERAL',
    target,
  }
}

function similarity(a: string, b: string): number {
  const sa = normalizeString(a).toLowerCase()
  const sb = normalizeString(b).toLowerCase()
  if (!sa || !sb) return 0
  if (sa === sb) return 1
  return trigramSimilarity(sa, sb)
}

function trigramSimilarity(a: string, b: string): number {
  const triA = trigrams(a)
  const triB = trigrams(b)
  if (triA.size === 0 && triB.size === 0) return 1
  if (triA.size === 0 || triB.size === 0) return 0

  let intersection = 0
  for (const tri of triA) {
    if (triB.has(tri)) intersection++
  }

  return (2 * intersection) / (triA.size + triB.size)
}

function trigrams(s: string): Set<string> {
  const padded = `  ${s}  `
  const result = new Set<string>()
  for (let i = 0; i <= padded.length - 3; i++) {
    result.add(padded.slice(i, i + 3))
  }
  return result
}

function last4(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(-4) : null
}

function deduplicateCandidates(candidates: ImportMatchCandidate[]): ImportMatchCandidate[] {
  const seen = new Set<string>()
  return candidates.filter((c) => {
    if (seen.has(c.targetId)) return false
    seen.add(c.targetId)
    return true
  })
}
