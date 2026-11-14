import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { startOfDayInBogota, endOfDayInBogota } from '@/lib/date-helpers'

// #691 — Esta ruta es SOLO de lectura. Antes tenía un POST (solo ADMIN, sin uso en la interfaz) que insertaba un
// cierre con los números que llegaran en el cuerpo, sin las reglas de POST /api/cierre (base de caja vigente,
// huecos entre cierres, embarques abiertos, efectivo esperado, conteo). Un día se cierra únicamente con
// POST /api/cierre.

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const { searchParams } = new URL(request.url)
    const fecha = searchParams.get('fecha')

    let where: { fecha?: { gte: Date; lte: Date } } = {}
    if (fecha) {
      const start = startOfDayInBogota(fecha)
      const end = endOfDayInBogota(fecha)
      where = { fecha: { gte: start, lte: end } }
    }
    const cierres = await prisma.cierreDia.findMany({
      where,
      orderBy: { fecha: 'desc' },
      take: 30,
    })

    return apiSuccess({ cierres })
  } catch (_error) {
    return apiError('Error', 500)
  }
}
