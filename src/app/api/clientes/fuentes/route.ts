import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'

export async function GET(_request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const fuentes = await prisma.cliente.findMany({
      select: { fuente: true },
      distinct: ['fuente'],
    })

    const fuentesFiltradas = fuentes
      .map(f => f.fuente)
      .filter(Boolean) as string[]

    return apiSuccess({ tipos: fuentesFiltradas })
  } catch (error) {
    return apiError('Error al obtener fuentes', 500)
  }
}
