/**
 * GET /api/alertas/notas-credito-count
 *
 * Devuelve un map { clienteId: count } de Notas de Credito emitidas
 * en los ultimos N dias (default 30) agrupadas por cliente.
 *
 * Alimenta la alerta NOTA_CREDITO_FRECUENTE del detector
 * (commit 1.3 plan antifraude). Patron "pide-factura-devuelve":
 * el cliente solicita NC repetidamente para obtener producto gratis
 * con factura limpia.
 *
 * Query params:
 *   ?dias=30   ventana de tiempo (default 30)
 *
 * Auth: requireAuth. Cualquier usuario autenticado puede leer.
 *
 * Cache: 60s (las NC cambian en escala de minutos, no segundos).
 * La cache se invalida implicitamente via el TTL — no hay mutacion
 * frecuente que requiera revalidateTag explicito.
 */

import { NextRequest } from 'next/server'
import { unstable_cache } from 'next/cache'
import { requireAuth } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

const CACHE_TTL = 60

async function fetchNotasCreditoCount(dias: number): Promise<Record<string, number>> {
  const fechaLimite = new Date(Date.now() - dias * 24 * 60 * 60 * 1000)

  // NotaCredito no tiene clienteId directo, pero Pedido.clienteId
  // es la via. Agrupamos por pedido.clienteId con un JOIN.
  const grupos = await prisma.notaCredito.groupBy({
    by: ['pedidoId'],
    where: {
      fecha: { gte: fechaLimite },
    },
    _count: { _all: true },
  })

  if (grupos.length === 0) return {}

  // Map pedidoId → clienteId (1 query batch)
  const pedidoIds = grupos.map((g) => g.pedidoId)
  const pedidos = await prisma.pedido.findMany({
    where: { id: { in: pedidoIds } },
    select: { id: true, clienteId: true },
  })
  const pedidoToCliente = new Map(pedidos.map((p) => [p.id, p.clienteId]))

  // Sumar counts por cliente
  const counts: Record<string, number> = {}
  for (const g of grupos) {
    const clienteId = pedidoToCliente.get(g.pedidoId)
    if (!clienteId) continue
    counts[clienteId] = (counts[clienteId] ?? 0) + g._count._all
  }

  return counts
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  try {
    const diasParam = request.nextUrl.searchParams.get('dias')
    const dias = Math.max(1, Math.min(365, Number(diasParam) || 30))

    // unstable_cache keyed por dias
    const cached = unstable_cache(
      () => fetchNotasCreditoCount(dias),
      [`alertas-nc-count-${dias}`],
      { revalidate: CACHE_TTL, tags: [`alertas-nc-count-${dias}`] },
    )
    const counts = await cached()
    return apiSuccess({ counts, dias })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching NC count:')
    return apiError('Error cargando notas de credito', 500)
  }
}
