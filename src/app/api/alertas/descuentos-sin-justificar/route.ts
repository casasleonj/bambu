/**
 * GET /api/alertas/descuentos-sin-justificar
 *
 * Devuelve los descuentos a repartidor sin justificar (justificado=false)
 * mas viejos que el umbral configurado. Alimenta la alerta
 * DESCUENTO_NO_JUSTIFICADO del detector (commit 1.4).
 *
 * Query params:
 *   ?dias=2   ventana en dias (default: DIAS_SIN_JUSTIFICAR_DESCUENTO
 *             de la tabla Config, o 2 si no existe)
 *
 * Patron: descuento a un repartidor sin foto/firma/documento que lo
 * respalde es sospechoso (puede ser una venta no reportada).
 *
 * Auth: requireAuth. Cualquier usuario autenticado puede leer.
 *
 * Cache: 60s.
 */

import { NextRequest } from 'next/server'
import { unstable_cache } from 'next/cache'
import { requireAuth } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { prisma } from '@/lib/prisma'
import { getConfigInt } from '@/lib/config'
import { logger } from '@/lib/logger'

const CACHE_TTL = 60

async function fetchDescuentosSinJustificar(dias: number) {
  const fechaLimite = new Date(Date.now() - dias * 24 * 60 * 60 * 1000)
  const descuentos = await prisma.descuentoRepartidor.findMany({
    where: {
      justificado: false,
      fecha: { lt: fechaLimite },
    },
    orderBy: { fecha: 'asc' },
  })
  return descuentos.map((d) => ({
    id: d.id,
    repartidorId: d.trabajadorId,
    fecha: d.fecha.toISOString(),
    monto: Number(d.monto),
    motivo: d.motivo,
  }))
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const diasParam = request.nextUrl.searchParams.get('dias')
    let dias: number

    if (diasParam) {
      dias = Math.max(0, Math.min(365, Number(diasParam) || 2))
    } else {
      // Si no se provee, usar el config
      dias = await getConfigInt('DIAS_SIN_JUSTIFICAR_DESCUENTO', 2)
    }

    const cached = unstable_cache(
      () => fetchDescuentosSinJustificar(dias),
      [`alertas-descuentos-sj-${dias}`],
      { revalidate: CACHE_TTL, tags: [`alertas-descuentos-sj-${dias}`] },
    )
    const descuentos = await cached()
    return apiSuccess({ descuentos, dias })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching descuentos:')
    return apiError('Error cargando descuentos', 500)
  }
}
