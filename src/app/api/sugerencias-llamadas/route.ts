/**
 * GET /api/sugerencias-llamadas
 *
 * Lista priorizada de clientes para llamar (outbound sales).
 * Query params:
 *  - top: máximo de resultados (default 30)
 *  - minDiasAtraso: mínimo de días atraso (default 0 = todos)
 *  - minScore: score mínimo (default 0)
 *
 * Auth: ADMIN, ASISTENTE, CONTADOR.
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { ROLES } from '@/lib/constants'
import { prisma } from '@/lib/prisma'
import { formatZodError } from '@/lib/utils'

const QuerySchema = z.object({
  top: z.coerce.number().int().positive().max(500).optional(),
  minDiasAtraso: z.coerce.number().int().nonnegative().optional(),
  minScore: z.coerce.number().nonnegative().optional(),
})

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE, ROLES.CONTADOR], authResult)
  if (roleCheck instanceof Response) return roleCheck

  const validation = QuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  )
  if (!validation.success) {
    return apiError('Parámetros inválidos', 400, { formErrors: [formatZodError(validation.error)] })
  }

  const { top = 30, minDiasAtraso = 0, minScore = 0 } = validation.data

  const clientes = await prisma.cliente.findMany({
    where: {
      activo: true,
      diasAtraso: { gte: minDiasAtraso },
      scoreLlamada: { gte: minScore },
    },
    select: {
      id: true,
      nombre: true,
      apellido: true,
      telefono: true,
      barrio: true,
      diasAtraso: true,
      scoreLlamada: true,
      valorTipico: true,
      intervaloMediano: true,
      proxEsperada: true,
      ultEntrega: true,
      ultimaLlamada: true,
    },
    orderBy: [{ scoreLlamada: 'desc' }, { diasAtraso: 'desc' }],
    take: top,
  })

  return apiSuccess({
    clientes: clientes.map(c => ({
      ...c,
      ultEntrega: c.ultEntrega?.toISOString() ?? null,
      proxEsperada: c.proxEsperada?.toISOString() ?? null,
      ultimaLlamada: c.ultimaLlamada?.toISOString() ?? null,
    })),
    total: clientes.length,
  })
}
