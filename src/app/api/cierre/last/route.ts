import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth-check'
import { ROLES } from '@/lib/constants'
import { logger } from '@/lib/logger'
import { z } from 'zod'
import { apiSuccess, apiError } from '@/lib/api-response'

const CierreLastSchema = z.object({
  includeDetails: z.coerce.boolean().optional(),
})

export async function GET(request: Request) {
  // FIX C-6: solo roles con acceso a info financiera agregada.
  // Antes, cualquier usuario autenticado (incluso REPARTIDOR o SELLADOR)
  // podía ver el último cierre diario con totales de caja, ventas, etc.
  // Ahora se restringe explícitamente.
  const authResult = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE, ROLES.CONTADOR])
  if (authResult instanceof Response) return authResult
  try {
    const url = new URL(request.url)
    const validation = CierreLastSchema.safeParse(
      Object.fromEntries(url.searchParams.entries())
    )
    if (!validation.success) {
      return apiError('Parámetros inválidos', 400)
    }
    const cierre = await prisma.cierreDia.findFirst({
      orderBy: { fecha: 'desc' },
    })
    return apiSuccess({ cierre })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error en /api/cierre/last')
    return apiError('Error', 500)
  }
}