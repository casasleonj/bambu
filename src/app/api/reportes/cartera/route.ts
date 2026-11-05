import { leerExigibles } from '@/lib/entregas-exigibles-db'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { apiSuccess, apiError } from '@/lib/api-response'

const CarteraSchema = z.object({
  minSaldo: z.coerce.number().nonnegative().optional(),
  limit: z.coerce.number().int().positive().max(500).optional().default(100),
  sortBy: z.enum(['saldo', 'fecha', 'cliente']).optional().default('saldo'),
})

export async function GET(request: Request) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole(['ADMIN', 'CONTADOR'], authResult)
  if (roleCheck instanceof Response) return roleCheck

  try {
    const url = new URL(request.url)
    const validation = CarteraSchema.safeParse(
      Object.fromEntries(url.searchParams.entries())
    )
    if (!validation.success) {
      return apiError('Parámetros inválidos', 400, validation.error.flatten())
    }

    const { minSaldo, limit, sortBy } = validation.data

    const originales = await prisma.factura.findMany({
      where: {
        saldo: { gt: minSaldo ?? 0 },
      },
      include: {
        cliente: true,
        pedido: true,
      },
      orderBy: { [sortBy]: 'desc' },
      take: limit,
    })

    const exigibles = await leerExigibles(prisma, { id: { in: originales.map(f => f.pedidoId) } })
    const facturas = originales.map(f => ({ ...f, exigible: exigibles.get(f.pedidoId) ?? 0 }))
    const totalCartera = facturas.reduce((sum, f) => sum + Math.round(f.exigible * 100), 0) / 100

    return apiSuccess({ facturas, totalCartera })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching cartera:')
    return apiError('Error fetching cartera', 500)
  }
}
