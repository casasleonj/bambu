import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'

export async function GET(_request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const tipos = await prisma.cliente.findMany({
      select: { tipoNegocio: true },
      distinct: ['tipoNegocio'],
    })

    const tiposFiltrados = tipos
      .map(t => t.tipoNegocio)
      .filter(Boolean) as string[]

    return apiSuccess({ tipos: tiposFiltrados })
  } catch (error) {
    return apiError('Error al obtener tipos de negocio', 500)
  }
}
