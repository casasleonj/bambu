/**
 * GET /api/search/clientes?q=...&limit=...
 *
 * Búsqueda semántica de clientes usando pg_trgm (word_similarity).
 * Requiere mínimo 2 caracteres para evitar resultados irrelevantes.
 *
 * Query params:
 *   - q: search query (mínimo 2 caracteres)
 *   - limit: max results (default 20, max 50)
 *
 * Returns: clientes ordenados por relevancia (similarity_score)
 */
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { apiSuccess, apiError } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult

  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('q')
  const limitParam = searchParams.get('limit')

  // Validación: mínimo 2 caracteres
  if (!query || query.trim().length < 2) {
    return apiSuccess({ clientes: [], query: query || '', minCharsRequired: 2 })
  }

  const limit = Math.min(parseInt(limitParam || '20', 10), 50)

  try {
    // Usar la función search_clientes de PostgreSQL con pg_trgm
    const results = await prisma.$queryRaw`
      SELECT * FROM search_clientes(${query}, ${limit})
    ` as Array<{
      id: string
      nombre: string
      apellido: string
      telefono: string
      barrio: string | null
      direccion: string | null
      nombreNegocio: string | null
      similarity_score: number
    }>

    // Enriquecer con datos adicionales (saldo, negocios, etc.)
    const clienteIds = results.map(r => r.id)

    if (clienteIds.length === 0) {
      return apiSuccess({ clientes: [], query, minCharsRequired: 2 })
    }

    const clientesFull = await prisma.cliente.findMany({
      where: { id: { in: clienteIds } },
      include: {
        _count: { select: { pedidos: true } },
        pedidos: {
          where: {
            saldo: { gt: 0 },
            estadoEntrega: { in: ['ENTREGADO', 'EN_RUTA', 'PENDIENTE', 'NO_ENTREGADO'] },
          },
          select: { saldo: true },
        },
        negocios: {
          select: {
            id: true,
            nombre: true,
            tipoNegocio: true,
            direccion: true,
            barrio: true,
            referencia: true,
          },
        },
      },
    })

    // Crear mapa de similarity scores
    const scoreMap = new Map(results.map(r => [r.id, r.similarity_score]))

    // Ordenar por similarity score
    const clientes = clientesFull
      .map(c => ({
        ...c,
        clienteId: c.id,
        saldoPendiente: c.pedidos.reduce((sum, p) => sum + Number(p.saldo), 0),
        similarity_score: scoreMap.get(c.id) ?? 0,
      }))
      .sort((a, b) => b.similarity_score - a.similarity_score)

    return apiSuccess({
      clientes,
      query,
      total: clientes.length,
    })
  } catch (error) {
    console.error('[search/clientes] Error:', error)
    return apiError('Error en búsqueda de clientes')
  }
}
