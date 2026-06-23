import type { Prisma } from '@prisma/client'
import type { ImportMatchCandidate } from './types'

export async function findSupplierMatches(
  tx: Prisma.TransactionClient,
  data: { nombre: string; nit?: string | null }
): Promise<ImportMatchCandidate[]> {
  const candidates: ImportMatchCandidate[] = []

  if (data.nit) {
    const byNit = await tx.proveedor.findUnique({
      where: { nit: data.nit },
      select: { id: true, nombre: true, telefono: true, direccion: true },
    })
    if (byNit) {
      candidates.push({
        targetId: byNit.id,
        score: 1.0,
        reason: 'NIT exacto',
        target: {
          id: byNit.id,
          nombre: byNit.nombre,
          telefono: byNit.telefono,
          direccion: byNit.direccion,
        },
      })
    }
  }

  const byName = await tx.proveedor.findFirst({
    where: {
      nombre: { equals: data.nombre, mode: 'insensitive' },
    },
    select: { id: true, nombre: true, telefono: true, direccion: true },
  })

  if (byName && !candidates.some((c) => c.targetId === byName.id)) {
    candidates.push({
      targetId: byName.id,
      score: 0.95,
      reason: 'Nombre exacto',
      target: {
        id: byName.id,
        nombre: byName.nombre,
        telefono: byName.telefono,
        direccion: byName.direccion,
      },
    })
  }

  // Fuzzy por nombre usando trigram si no hubo match exacto
  if (candidates.length === 0 && data.nombre.length > 2) {
    const fuzzy = await tx.$queryRaw<Array<{ id: string; nombre: string; telefono: string | null; direccion: string | null; sim: number }>>`
      SELECT id, nombre, telefono, direccion, similarity(nombre, ${data.nombre}) as sim
      FROM "Proveedor"
      WHERE nombre % ${data.nombre}
      ORDER BY sim DESC
      LIMIT 3
    `
    for (const row of fuzzy) {
      if (row.sim >= 0.5) {
        candidates.push({
          targetId: row.id,
          score: Number(row.sim),
          reason: `Nombre similar (${Math.round(Number(row.sim) * 100)}%)`,
          target: {
            id: row.id,
            nombre: row.nombre,
            telefono: row.telefono,
            direccion: row.direccion,
          },
        })
      }
    }
  }

  return candidates.sort((a, b) => b.score - a.score)
}

export async function findInsumoMatches(
  tx: Prisma.TransactionClient,
  data: { nombre: string }
): Promise<ImportMatchCandidate[]> {
  const existing = await tx.insumo.findFirst({
    where: { nombre: { equals: data.nombre, mode: 'insensitive' } },
    select: { id: true, nombre: true, unidad: true },
  })

  if (!existing) return []

  return [{
    targetId: existing.id,
    score: 1.0,
    reason: 'Nombre exacto',
    target: {
      id: existing.id,
      nombre: existing.nombre,
      telefono: null,
      direccion: null,
      barrio: null,
    },
  }]
}
