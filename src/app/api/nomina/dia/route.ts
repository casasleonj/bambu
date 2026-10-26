import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { parseDateParam, todayStringBogota } from '@/lib/dates'
import { comisionDiaConEstado } from '@/lib/comision-pagada'

/**
 * GET /api/nomina/dia?fecha=YYYY-MM-DD — comisión de cada repartidor en un día de
 * Bogotá (hoy por defecto). Solo lectura: no genera nómina ni toca la caja (#499).
 * Misma regla que la nómina del período (`comision-repartidor.ts`).
 */
export async function GET(request: NextRequest) {
  // Salarios y comisiones son datos de RR. HH.: solo ADMIN/CONTADOR (igual que /api/nomina).
  const authResult = await requireRole(['ADMIN', 'CONTADOR'])
  if (authResult instanceof Response) return authResult

  const fecha = parseDateParam(new URL(request.url).searchParams.get('fecha'), todayStringBogota())

  try {
    const repartidores = await comisionDiaConEstado(prisma, fecha)
    return apiSuccess({
      fecha,
      repartidores,
      total: repartidores.reduce((s, r) => s + r.total, 0),
      pagado: repartidores.reduce((s, r) => s + r.pagado, 0),
      pendiente: repartidores.reduce((s, r) => s + r.pendiente, 0),
    })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error calculando comisiones del día:')
    return apiError('Error calculando las comisiones del día', 500)
  }
}
