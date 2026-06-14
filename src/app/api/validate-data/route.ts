import { NextRequest } from 'next/server'
import { runValidation } from '../../../../prisma/validate-data'
import { requireAuth } from '@/lib/auth-check'
import { requireRole } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'

/**
 * GET /api/validate-data
 *
 * commit 5 plan antifraude: ejecuta los 23 checks de integridad de
 * prisma/validate-data.ts y devuelve los resultados como JSON. La
 * version de consola (npx tsx prisma/validate-data.ts) sigue
 * funcionando para debugging offline.
 *
 * Acceso: solo ADMIN/CONTADOR. La pagina /reportes/salud-antifraude
 * es el consumidor principal. Es pesado de correr (toca todas las
 * tablas) → cache 60s en el cliente.
 */
export async function GET(_request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const roleCheck = await requireRole(['ADMIN', 'CONTADOR'])
  if (roleCheck instanceof Response) return roleCheck

  try {
    const results = await runValidation()
    return apiSuccess({
      results,
      totales: {
        pass: results.filter((r) => r.status === 'PASS').length,
        fail: results.filter((r) => r.status === 'FAIL').length,
        warn: results.filter((r) => r.status === 'WARN').length,
        total: results.length,
      },
    })
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : 'Unknown' },
      'Error ejecutando validate-data:',
    )
    return apiError('Error ejecutando validacion de datos', 500)
  }
}
