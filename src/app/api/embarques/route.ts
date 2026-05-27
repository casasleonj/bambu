import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { EmbarqueCreateSchema } from '@/lib/validators'
import { getTodayRange } from '@/lib/dates'
import { logAudit } from '@/lib/audit'
import { calcularPesoDesdeCarga, getCapacidadInfo, type CargaSnapshot } from '@/lib/embarque-capacidad'
import { getNextNumeroDia } from '@/lib/sequence'
import { withAdvisoryLock } from '@/lib/locks'
import { emptyStock } from '@/lib/stock'
import { EstadoEmbarque } from '@prisma/client'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const session = authResult as { user?: { id?: string; role?: string } }
  try {
    const desde = request.nextUrl.searchParams.get('desde')
    const hasta = request.nextUrl.searchParams.get('hasta')
    const all = request.nextUrl.searchParams.get('all')
    const estado = request.nextUrl.searchParams.get('estado')

    const where: Record<string, unknown> = {}

    if (session.user?.role === 'REPARTIDOR') {
      const trabajador = await prisma.trabajador.findFirst({
        where: { userId: session.user.id },
        select: { id: true },
      })
      if (trabajador) {
        where.trabajadorId = trabajador.id
      } else {
        return apiSuccess({ embarques: [], total: 0 })
      }
    }

    if (estado) {
      where.estado = estado
    } else {
      where.estado = { not: EstadoEmbarque.CANCELADO }
    }

    if (!(all === 'true')) {
      if (desde && hasta) {
        const { startDate, endDate } = (() => {
          const s = new Date(desde)
          const e = new Date(hasta)
          e.setDate(e.getDate() + 1)
          return { startDate: s, endDate: e }
        })()
        where.fecha = { gte: startDate, lt: endDate }
      } else {
        const { startOfDay, endOfDay } = getTodayRange()
        where.fecha = { gte: startOfDay, lt: endOfDay }
      }
    }

    const [embarquesRaw, total] = await Promise.all([
      prisma.embarque.findMany({
        where,
        include: {
          ruta: { select: { id: true, nombre: true } },
          productos: true,
          trabajador: {
            select: { id: true, nombre: true, capacidadKg: true, comPacaAgua: true, comPacaHielo: true, comBotellon: true, comRepartAgua: true, comRepartHielo: true, comRepartBotellon: true },
          },
        },
        orderBy: [{ fecha: 'desc' }, { numero: 'desc' }],
      }),
      prisma.embarque.count({ where }),
    ])

    const embarques = embarquesRaw.map((e) => {
      const carga: CargaSnapshot = emptyStock() as CargaSnapshot
      for (const prod of e.productos) {
        const key = prod.producto as keyof typeof carga
        if (key in carga) carga[key] = prod.cargadas
      }
      if (e.productos.length === 0) {
        carga.PACA_AGUA = e.pacasAgua
        carga.PACA_HIELO = e.pacasHielo
      }
      const totalPacas = Object.values(carga).reduce((s, v) => s + v, 0)
      const pesoKg = calcularPesoDesdeCarga(carga)
      const capacidadKg = e.trabajador.capacidadKg || 500
      const capacidadInfo = getCapacidadInfo(totalPacas, pesoKg, capacidadKg)
      return {
        ...e,
        totalPacas,
        pesoKg,
        capacidadKg,
        capacidadInfo,
      }
    })

    const stock = request.nextUrl.searchParams.get('stock')
    if (stock === 'true') {
      const { getStockDisponible } = await import('@/lib/stock')
      const stockResult = await getStockDisponible()
      return apiSuccess({ embarques, total, stock: stockResult.stock, tieneStockEstimado: stockResult.tieneEstimado })
    }

    return apiSuccess({ embarques, total })
  } catch (error) {
    return apiError('Error cargando embarques')
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.REPARTIDOR], authResult)
  if (roleCheck instanceof Response) return roleCheck
  try {
    const body = await request.json()
    const parsed = EmbarqueCreateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('Datos invalidos', 400, { formErrors: [formatZodError(parsed.error)] })
    }

    const result = await withAdvisoryLock('EMBARQUE', async (tx) => {
      const trabajador = await tx.trabajador.findUnique({
        where: { id: parsed.data.trabajadorId },
        select: { id: true, nombre: true, capacidadKg: true },
      })

      if (!trabajador) {
        throw new Error('TRABAJADOR_NOT_FOUND')
      }

      const carga: CargaSnapshot = emptyStock() as CargaSnapshot
      for (const item of parsed.data.carga) {
        const key = item.producto as keyof typeof carga
        if (key in carga) {
          carga[key] = item.cargadas
        }
      }

      const { evaluarStock } = await import('@/lib/stock')
      const stockEval = await evaluarStock(carga)

      const MAX_OVERRIDE_PCT = 0.5

      if (stockEval.hasDeficit) {
        for (const key of ['PACA_AGUA', 'PACA_HIELO'] as const) {
          const disponible = stockEval.disponible[key]
          const maxAllowed = Math.floor(disponible * (1 + MAX_OVERRIDE_PCT))
          if (carga[key] > maxAllowed) {
            throw new Error(`STOCK_OVERRIDE_EXCEEDED: ${key} excede límite de override (${maxAllowed} máximo con 50% sobre disponible ${disponible})`)
          }
        }
      }

      const totalUnidades = parsed.data.carga.reduce((s, item) => s + item.cargadas, 0)
      if (totalUnidades > 70) {
        throw new Error(`MAX_UNITS_EXCEEDED: ${totalUnidades} unidades exceden el máximo de 70`)
      }

      getTodayRange()
      const numeroDia = await getNextNumeroDia(tx, parsed.data.trabajadorId, new Date())

      const { getStockDisponible } = await import('@/lib/stock')
      const stockResult = await getStockDisponible()
      const disponible = stockResult.stock

      const stockSnapshotData: Record<string, unknown> = {
        fecha: new Date().toISOString(),
        disponible,
        cargado: carga,
        deficit: stockEval.deficit,
        totalDeficit: stockEval.totalDeficit,
        overrideRequerido: stockEval.hasDeficit,
        overrideAutorizadoPor: stockEval.hasDeficit ? (authResult as { user?: { id?: string } }).user?.id : null,
        overrideTimestamp: stockEval.hasDeficit ? new Date().toISOString() : null,
      }

      const embarque = await tx.embarque.create({
        data: {
          trabajadorId: parsed.data.trabajadorId,
          rutaId: parsed.data.rutaId || null,
          tipoMoto: parsed.data.tipoMoto || null,
          horaSalida: parsed.data.horaSalida ? new Date(parsed.data.horaSalida) : null,
          estado: EstadoEmbarque.ABIERTO,
          obs: parsed.data.obs,
          numeroDia,
          baseDinero: parsed.data.baseDinero,
          stockSnapshot: JSON.stringify(stockSnapshotData),
          productos: {
            create: parsed.data.carga.map(item => ({
              producto: item.producto,
              cargadas: item.cargadas,
            })),
          },
        },
        include: {
          trabajador: true,
          ruta: true,
          productos: true,
        },
      })

      return embarque
    })

    logAudit({
      entidad: 'Embarque',
      registroId: result.id,
      accion: 'CREATE',
      datos: { numero: result.numero, numeroDia: result.numeroDia, trabajadorId: result.trabajadorId },
      usuarioId: (authResult as { user?: { id?: string } }).user?.id,
    })

    return apiSuccess({ embarque: result }, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown'
    if (message === 'TRABAJADOR_NOT_FOUND') {
      return apiError('Trabajador no encontrado', 400)
    }
    if (message.startsWith('STOCK_INSUFFICIENT')) {
      return apiError(message.replace('STOCK_INSUFFICIENT: ', 'Stock insuficiente: '), 400)
    }
    if (message.startsWith('MAX_UNITS_EXCEEDED')) {
      return apiError('Máximo 70 unidades por embarque', 400)
    }
    if (message.startsWith('STOCK_OVERRIDE_EXCEEDED')) {
      return apiError(message.replace('STOCK_OVERRIDE_EXCEEDED: ', ''), 400)
    }
    logger.error({ err: message }, 'Error creating embarque:')
    return apiError('Error creando embarque')
  }
}

export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN], authResult)
  if (roleCheck instanceof Response) return roleCheck
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return apiError('ID requerido', 400)

    const embarque = await prisma.embarque.findUnique({
      where: { id },
      include: { pedidos: true },
    })

    if (!embarque) return apiError('Embarque no encontrado', 404)
    if (embarque.estado !== EstadoEmbarque.ABIERTO) {
      return apiError('Solo se pueden cancelar embarques abiertos', 400)
    }

    await prisma.pedido.updateMany({
      where: { embarqueId: id },
      data: { embarqueId: null, estado: 'PENDIENTE', estadoEntrega: 'PENDIENTE' },
    })

    await prisma.embarque.update({
      where: { id },
      data: { estado: EstadoEmbarque.CANCELADO },
    })

    return apiSuccess({ message: 'Embarque cancelado' })
  } catch (error) {
    return apiError('Error cancelando embarque')
  }
}
