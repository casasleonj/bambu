import { Prisma, type PrismaClient } from '@prisma/client'
import { normalizeString } from './normalizer'

/**
 * Resolución fuzzy de trabajadores por nombre.
 *
 * Usa pg_trgm similarity para tolerar variaciones de tipeo, abreviaturas
 * y tildes. Pensado para importaciones históricas donde el nombre en el
 * papel puede no coincidir exactamente con el nombre en la base de datos.
 */

const DEFAULT_THRESHOLD = 0.5

interface WorkerMatchRow {
  id: string
  nombre: string
  similarity: number
}

export async function findWorkerByName(
  tx: PrismaClient | Prisma.TransactionClient,
  name: string,
  threshold = DEFAULT_THRESHOLD
): Promise<{ id: string; nombre: string; score: number } | null> {
  const normalized = normalizeString(name).toLowerCase()
  if (!normalized) return null

  const query = Prisma.sql`
    SELECT
      t.id,
      t.nombre,
      similarity(${normalized}, LOWER(t.nombre)) AS similarity
    FROM "Trabajador" t
    WHERE t.activo = true
      AND similarity(${normalized}, LOWER(t.nombre)) >= ${threshold}
    ORDER BY similarity DESC
    LIMIT 1
  `

  const rows = await tx.$queryRaw<WorkerMatchRow[]>(query)
  if (rows.length === 0) return null

  return {
    id: rows[0].id,
    nombre: rows[0].nombre,
    score: Number(rows[0].similarity),
  }
}
