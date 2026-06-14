/**
 * GET /api/forecast-produccion
 *
 * Pronóstico agregado por día de la semana para las próximas semanas.
 * Útil para decidir cuánta agua/hielo producir por día.
 *
 * Query params:
 *  - semanas: cuántas semanas hacia atrás mirar (default 8)
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
import { pronosticarPorDiaSemana, nombreDia, type PedidoParaPronostico } from '@/lib/demanda/forecasting'

const QuerySchema = z.object({
  semanas: z.coerce.number().int().positive().max(52).optional(),
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
  const { semanas = 8 } = validation.data

  const pedidos = await prisma.pedido.findMany({
    where: {
      estado: { in: ['ENTREGADO', 'PENDIENTE', 'EN_RUTA'] },
    },
    select: { fecha: true, total: true, estado: true },
    orderBy: { fecha: 'desc' },
    take: 5000, // cap para performance; ajustar si la app crece
  })

  const input: PedidoParaPronostico[] = pedidos.map(p => ({
    fecha: p.fecha,
    total: Number(p.total),
    estado: p.estado,
  }))

  const r = pronosticarPorDiaSemana(input, semanas)

  return apiSuccess({
    ...r,
    porDia: r.porDia.map(d => ({
      ...d,
      nombre: nombreDia(d.diaSemana),
    })),
    semanasConsultadas: semanas,
    generadoEn: new Date().toISOString(),
  })
}
