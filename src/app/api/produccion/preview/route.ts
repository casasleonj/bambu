import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-check'
import { getVentasDelDia } from '@/lib/ventas'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const fechaParam = request.nextUrl.searchParams.get('fecha')
    const fecha = fechaParam ? new Date(fechaParam) : new Date()
    const startOfDay = new Date(fecha)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(startOfDay)
    endOfDay.setDate(endOfDay.getDate() + 1)

    const [ultimoCierre, ventas, embarques] = await Promise.all([
      prisma.cierreDia.findFirst({ orderBy: { fecha: 'desc' } }),
      getVentasDelDia(fecha),
      prisma.embarque.findMany({
        where: {
          fecha: { gte: startOfDay, lt: endOfDay },
          estado: { notIn: ['CANCELADO'] },
        },
        include: {
          trabajador: {
            select: {
              id: true,
              nombre: true,
              comPacaAgua: true,
              comPacaHielo: true,
              comRepartAgua: true,
              comRepartHielo: true,
            },
          },
        },
      }),
    ])

    // Agrupar entregas por repartidor (pacas asignadas - devueltas - rotas)
    const repMap = new Map<string, {
      id: string
      nombre: string
      comRepartAgua: number
      comRepartHielo: number
      entregasAgua: number
      entregasHielo: number
    }>()
    for (const e of embarques) {
      const entregasAgua = Math.max(0, e.pacasAgua - e.devueltasAgua - e.rotasAgua)
      const entregasHielo = Math.max(0, e.pacasHielo - e.devueltasHielo - e.rotasHielo)
      const existing = repMap.get(e.trabajador.id)
      if (existing) {
        existing.entregasAgua += entregasAgua
        existing.entregasHielo += entregasHielo
      } else {
        repMap.set(e.trabajador.id, {
          id: e.trabajador.id,
          nombre: e.trabajador.nombre,
          comRepartAgua: Number(e.trabajador.comRepartAgua || e.trabajador.comPacaAgua),
          comRepartHielo: Number(e.trabajador.comRepartHielo || e.trabajador.comPacaHielo),
          entregasAgua,
          entregasHielo,
        })
      }
    }
    const repartidores = Array.from(repMap.values())

    return apiSuccess({
      stockIniAgua: ultimoCierre?.stockFinAgua || 0,
      stockIniHielo: ultimoCierre?.stockFinHielo || 0,
      ventasAgua: ventas.aguaVendida,
      ventasHielo: ventas.hieloVendido,
      repartidores,
      embarquesAbiertos: embarques.some((e) => e.estado === 'ABIERTO'),
    })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching produccion preview:')
    return apiError('Error', 500)
  }
}
