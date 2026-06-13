/**
 * GET /api/alertas/repartidor-deudas
 *
 * Devuelve la deuda acumulada por repartidor (deudaReposAgua +
 * deudaReposHielo de Trabajador) para alimentar la alerta
 * REPARTIDOR_DEUDA_ALTA (commit 1.5 plan antifraude).
 *
 * Solo retorna repartidores con deuda > 0 (los que tienen 0 no
 * necesitan alerta). El caller (alerts page) convierte el objeto
 * `deudas` a un Map<repartidorId, { deudaAgua, deudaHielo }>.
 *
 * Auth: requireAuth. Cualquier usuario autenticado puede leer.
 *
 * Cache: 60s (la deuda cambia cuando el admin registra reposiciones,
 * no en escala de segundos).
 */

import { NextRequest } from 'next/server'
import { unstable_cache } from 'next/cache'
import { requireAuth } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

const CACHE_TTL = 60

async function fetchRepartidorDeudas() {
  // Solo traer repartidores con deuda > 0 (al menos 1 paca de agua o hielo)
  const trabajadores = await prisma.trabajador.findMany({
    where: {
      OR: [
        { deudaReposAgua: { gt: 0 } },
        { deudaReposHielo: { gt: 0 } },
      ],
    },
    select: {
      id: true,
      nombre: true,
      deudaReposAgua: true,
      deudaReposHielo: true,
    },
  })
  const deudas: Record<string, { nombre: string; deudaAgua: number; deudaHielo: number }> = {}
  for (const t of trabajadores) {
    deudas[t.id] = {
      nombre: t.nombre,
      deudaAgua: Number(t.deudaReposAgua),
      deudaHielo: Number(t.deudaReposHielo),
    }
  }
  return deudas
}

export async function GET(_request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const cached = unstable_cache(
      fetchRepartidorDeudas,
      ['alertas-repartidor-deudas'],
      { revalidate: CACHE_TTL, tags: ['alertas-repartidor-deudas'] },
    )
    const deudas = await cached()
    return apiSuccess({ deudas })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching repartidor deudas:')
    return apiError('Error cargando deudas de repartidores', 500)
  }
}
