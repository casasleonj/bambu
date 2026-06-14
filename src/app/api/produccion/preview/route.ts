import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/auth-check'
import { getVentasDelDia } from '@/lib/ventas'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { startOfDayInBogota, endOfDayInBogota, todayInBogota } from '@/lib/date-helpers'

export async function GET(request: NextRequest) {
  // FIX HIGH (C-SEC-11): Only users with view:produccion can see production preview
  // Previously: requireAuth() only — REPARTIDOR/SELLADOR could see other repartidores' commissions
  // and stock estimates. The permission is needed for the production workflow.
  const authResult = await requirePermission('view:produccion')
  if (authResult instanceof Response) return authResult
  try {
    // FIX 1.6: usar TZ Bogotá explícita para que el rango del día
    // coincida con el guardado en Produccion.fecha
    const fechaParam = request.nextUrl.searchParams.get('fecha')
    const fechaStr = fechaParam ? fechaParam.split('T')[0] : todayInBogota()
    const startOfDay = startOfDayInBogota(fechaStr)
    const endOfDay = endOfDayInBogota(fechaStr)

    const [ultimoCierre, ventas, embarquesCerrados, embarquesDelDia] = await Promise.all([
      prisma.cierreDia.findFirst({ orderBy: { fecha: 'desc' } }),
      getVentasDelDia(new Date(`${fechaStr}T12:00:00-05:00`)),
      prisma.embarque.findMany({
        where: {
          fecha: { gte: startOfDay, lt: endOfDay },
          estado: 'CERRADO',
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
      prisma.embarque.findMany({
        where: {
          fecha: { gte: startOfDay, lt: endOfDay },
          estado: 'ABIERTO',
        },
        select: { id: true },
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
    for (const e of embarquesCerrados) {
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
      embarquesAbiertos: embarquesDelDia.length > 0,
    })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching produccion preview:')
    return apiError('Error', 500)
  }
}
