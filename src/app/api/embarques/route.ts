/**
 * Embarques API Route — Thin Controller.
 *
 * Delegates to use cases for business logic.
 * GET and DELETE still use inline logic for backward compatibility.
 * POST delegates to CrearEmbarqueUseCase.
 */

import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { EmbarqueCreateSchema } from '@/lib/validators'
import { getTodayRange } from '@/lib/dates'
import { logAudit } from '@/lib/audit'
import { calcularPesoDesdeCarga, getCapacidadInfo, type CargaSnapshot } from '@/lib/embarque-capacidad'
import { emptyStock } from '@/lib/stock'
import { EstadoEmbarque } from '@prisma/client'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { publishRealtimeEvent } from '@/lib/realtime'

// DDD imports
import { PrismaEmbarqueRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueRepository'
import { PrismaEmbarqueProductoRepository } from '@/modules/embarques/infrastructure/repositories/PrismaEmbarqueProductoRepository'
import { PrismaTransactionManager } from '@/modules/embarques/infrastructure/transactions/PrismaTransactionManager'
import { StockValidator } from '@/modules/embarques/infrastructure/stock/StockValidator'
import { CrearEmbarqueUseCase } from '@/modules/embarques/application/use-cases/CrearEmbarqueUseCase'
import { CancelarEmbarqueUseCase } from '@/modules/embarques/application/use-cases/CancelarEmbarqueUseCase'
import type { ITrabajadorEmbarqueRepository, TrabajadorEmbarqueData } from '@/modules/embarques/domain'

// Infrastructure dependencies (lazy-instantiated)
const embarqueRepo = new PrismaEmbarqueRepository()
const productoRepo = new PrismaEmbarqueProductoRepository()
const txManager = new PrismaTransactionManager()
const stockRepo = new StockValidator()

// Worker repo adapter
const workerRepo: ITrabajadorEmbarqueRepository = {
  async findById(id: string, tx?: unknown): Promise<TrabajadorEmbarqueData | null> {
    const client = (tx as typeof prisma) ?? prisma
    const raw = await client.trabajador.findUnique({
      where: { id },
      select: { id: true, nombre: true, telefono: true, usaMoto: true, capacidadKg: true },
    })
    if (!raw) return null
    return {
      id: raw.id,
      nombre: raw.nombre,
      telefono: raw.telefono ?? undefined,
      usaMoto: raw.usaMoto,
      capacidadKg: raw.capacidadKg,
    }
  },
  async findRepartidoresDisponibles(_fecha: Date, _tx?: unknown): Promise<TrabajadorEmbarqueData[]> {
    const raw = await prisma.trabajador.findMany({
      where: { usaMoto: true, activo: true },
      select: { id: true, nombre: true, telefono: true, usaMoto: true, capacidadKg: true },
    })
    return raw.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      telefono: r.telefono ?? undefined,
      usaMoto: r.usaMoto,
      capacidadKg: r.capacidadKg,
    }))
  },
}

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
        const s = new Date(desde)
        const e = new Date(hasta)
        e.setDate(e.getDate() + 1)
        where.fecha = { gte: s, lt: e }
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
          _count: { select: { pedidos: true } },
          trabajador: {
            select: { id: true, nombre: true, capacidadKg: true, comPacaAgua: true, comPacaHielo: true, comBotellon: true, comRepartAgua: true, comRepartHielo: true, comRepartBotellon: true },
          },
          pedidos: {
            take: 50,
            select: {
              id: true,
              numero: true,
              estado: true,
              estadoEntrega: true,
              estadoPago: true,
              origen: true,
              total: true,
              totalPagado: true,
              saldo: true,
              cPacaAguaPed: true,
              cPacaHieloPed: true,
              cBotellonFabPed: true,
              cBotellonDomPed: true,
              cBolsaAguaPed: true,
              cBolsaHieloPed: true,
              cPacaAguaEnt: true,
              cPacaHieloEnt: true,
              cBotellonFabEnt: true,
              cBotellonDomEnt: true,
              cBolsaAguaEnt: true,
              cBolsaHieloEnt: true,
              cliente: { select: { id: true, nombre: true, barrio: true, telefono: true } },
            },
            orderBy: { numero: 'asc' },
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
        pedidos: e.pedidos.map((p) => ({
          ...p,
          total: Number(p.total),
          totalPagado: Number(p.totalPagado),
          saldo: Number(p.saldo),
        })),
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
  const roleCheck = await requireRole([ROLES.ADMIN, ROLES.ASISTENTE], authResult)
  if (roleCheck instanceof Response) return roleCheck

  const session = authResult as { user?: { id?: string } }

  try {
    const body = await request.json()
    const parsed = EmbarqueCreateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('Datos invalidos', 400, { formErrors: [formatZodError(parsed.error)] })
    }

    // Delegate to use case
    const useCase = new CrearEmbarqueUseCase(embarqueRepo, workerRepo, stockRepo, productoRepo, txManager)

    const carga: Record<string, number> = {}
    for (const item of parsed.data.carga) {
      carga[item.producto] = item.cargadas
    }

    const result = await useCase.execute({
      trabajadorId: parsed.data.trabajadorId,
      rutaId: parsed.data.rutaId,
      carga: carga as never,
      tipoMoto: parsed.data.tipoMoto,
      baseDinero: parsed.data.baseDinero,
      obs: parsed.data.obs,
      createdById: session.user?.id,
      verificarStock: true,
    })

    logAudit({
      entidad: 'Embarque',
      registroId: result.id,
      accion: 'CREATE',
      datos: { numero: result.numero, numeroDia: result.numeroDia, trabajadorId: result.trabajadorId },
      usuarioId: session.user?.id,
    })

    publishRealtimeEvent('embarque.created', result.id).catch(() => {})

    return apiSuccess({ embarque: result }, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown'
    if (message === 'TRABAJADOR_NOT_FOUND') {
      return apiError('Trabajador no encontrado', 400)
    }
    if (message.includes('no tiene moto')) {
      return apiError('Este trabajador no tiene moto asignada', 400)
    }
    if (message.startsWith('STOCK_INSUFFICIENT')) {
      return apiError(message.replace('STOCK_INSUFFICIENT: ', 'Stock insuficiente: '), 400)
    }
    if (message.includes('70')) {
      return apiError('Maximo 70 unidades por embarque', 400)
    }
    if (message.includes('peso') || message.includes('capacidad')) {
      return apiError('La carga excede la capacidad de la moto', 400)
    }
    if (message.includes('ya tiene un embarque')) {
      return apiError('El trabajador ya tiene un embarque abierto hoy', 409)
    }
    if (message.includes('P2002') || message.includes('unique constraint')) {
      return apiError('Ya existe un embarque con ese numero para este repartidor hoy', 409)
    }
    logger.error({ err: message }, 'Error creating embarque:')
    return apiError(`Error creando embarque: ${message}`, 500)
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

    // We need a pedido repo for cancel — inline for now
    const pedidoRepo = {
      async findByEmbarqueId(embarqueId: string, tx?: unknown) {
        const client = (tx as typeof prisma) ?? prisma
        const raw = await client.pedido.findMany({
          where: { embarqueId },
          select: { id: true },
        })
        return raw.map((p: { id: string }) => ({ id: p.id, numero: 0, clienteId: '', clienteNombre: '', embarqueId, estadoEntrega: '', estado: '', total: 0, items: [], pagos: [] }))
      },
      async reassignToEmbarque(pedidoId: string, nuevoEmbarqueId: string | null, tx?: unknown) {
        const client = (tx as typeof prisma) ?? prisma
        await client.pedido.update({
          where: { id: pedidoId },
          data: { embarqueId: nuevoEmbarqueId, estado: 'PENDIENTE', estadoEntrega: 'PENDIENTE' },
        })
      },
    }

    const cancelUseCase = new CancelarEmbarqueUseCase(embarqueRepo, pedidoRepo as never, txManager)
    await cancelUseCase.execute({ id })

    publishRealtimeEvent('embarque.deleted', id).catch(() => {})
    // Pedidos reasignados también cambiaron de estado/embarque.
    const reasignados = await pedidoRepo.findByEmbarqueId(id)
    reasignados.forEach((p) => {
      publishRealtimeEvent('pedido.updated', p.id).catch(() => {})
    })

    return apiSuccess({ message: 'Embarque cancelado' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown'
    if (message.includes('Solo se pueden cancelar') || message.includes('transicion')) {
      return apiError('Solo se pueden cancelar embarques abiertos', 400)
    }
    if (message === 'EMBARQUE_NOT_FOUND') {
      return apiError('Embarque no encontrado', 404)
    }
    return apiError('Error cancelando embarque')
  }
}
