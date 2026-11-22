import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth-check'
import { apiError, apiSuccess } from '@/lib/api-response'
import { categoriasGastoDisponibles } from '@/lib/gastos-categorias'
import { logger } from '@/lib/logger'

/** Opciones históricas + base, sin exponer movimientos ni datos personales. */
export async function GET() {
  const auth = await requireRole(['ADMIN', 'CONTADOR'])
  if (auth instanceof Response) return auth

  try {
    const existentes = await prisma.gasto.findMany({
      distinct: ['categoria'],
      select: { categoria: true },
      where: {
        NOT: [
          { categoria: 'NOMINA' },
          { esPagoPersonal: true },
          { trabajadorId: { not: null } },
          { embarqueId: { not: null } },
          { descripcion: { startsWith: 'Reversión nómina anulada -' } },
        ],
      },
    })
    return apiSuccess({ categorias: categoriasGastoDisponibles(existentes.map(gasto => gasto.categoria)) })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error consultando categorias de gastos')
    return apiError('No se pudieron cargar las categorías de gastos.', 500)
  }
}
