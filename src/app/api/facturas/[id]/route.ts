import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const { id } = await params

    const factura = await prisma.factura.findUnique({
      where: { id },
      include: {
        cliente: true,
        pedido: {
          include: {
            items: true,
            pagos: true,
          },
        },
        abonos: {
          orderBy: { fecha: 'desc' },
        },
        notasCredito: true,
        createdBy: {
          select: { username: true },
        },
      },
    })

    if (!factura) {
      return apiError('Factura no encontrada', 404)
    }

    return apiSuccess({ factura })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching factura:')
    return apiError('Error fetching factura', 500)
  }
}
