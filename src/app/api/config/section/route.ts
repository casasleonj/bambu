import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { validateConfigBatch } from '@/lib/config-validation'
import { revalidateConfigCache } from '@/lib/config'

/**
 * POST /api/config/section
 * Atomically upsert multiple config entries for a section.
 * All entries are validated and saved in a single transaction.
 * If any entry fails validation or DB error, the entire section rolls back.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const body = await request.json()

  // Validate request shape
  if (!body || !Array.isArray(body.entries) || body.entries.length === 0) {
    return apiError('Se requiere un array de entries con {clave, valor}', 400)
  }

  const entries: Array<{ clave: string; valor: string }> = body.entries

  // Validate all keys are strings and values are strings
  for (const entry of entries) {
    if (typeof entry.clave !== 'string' || typeof entry.valor !== 'string') {
      return apiError('Cada entry debe tener clave (string) y valor (string)', 400)
    }
  }

  // Semantic validation for all entries
  const validationErrors = validateConfigBatch(entries)
  if (validationErrors.size > 0) {
    const firstKey = validationErrors.keys().next().value as string
    const message = validationErrors.get(firstKey)!
    return apiError(`${firstKey}: ${message}`, 400)
  }

  // Role check: BASE_DIA keys can be set by any authenticated user
  // Other keys require ADMIN or CONTADOR
  const hasNonBaseDia = entries.some(e => !e.clave.startsWith('BASE_DIA'))
  if (hasNonBaseDia) {
    const roleCheck = await requireRole(['ADMIN', 'CONTADOR'], authResult)
    if (roleCheck instanceof Response) return roleCheck
  }

  try {
    // Atomic upsert of all entries in a single transaction
    const configs = await prisma.$transaction(
      entries.map(entry =>
        prisma.config.upsert({
          where: { clave: entry.clave },
          update: { valor: entry.valor },
          create: { clave: entry.clave, valor: entry.valor },
        })
      )
    )

    // Audit log (fire-and-forget)
    logAudit({
      entidad: 'Config',
      registroId: configs.map(c => c.id).join(','),
      accion: 'UPDATE',
      datos: { entries: entries.map(e => e.clave) },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    revalidateConfigCache()

    return apiSuccess({ configs }, 200)
  } catch (error) {
    return apiError('Error guardando configuración', 500)
  }
}
