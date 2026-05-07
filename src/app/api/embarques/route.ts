import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { EmbarqueCreateSchema } from '@/lib/validators'
import { getPaginationParams, getPrismaPagination, buildPaginationResponse } from '@/lib/pagination'
import { getTodayRange, getDateRange } from '@/lib/dates'
import { logAudit } from '@/lib/audit'
import { calcularPacasEmbarque, calcularPesoEmbarque, getCapacidadInfo } from '@/lib/embarque-capacidad'
import { EstadoEmbarque } from '@prisma/client'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const pagination = getPaginationParams(request.nextUrl.searchParams)
  try {
    const desde = request.nextUrl.searchParams.get('desde')
    const hasta = request.nextUrl.searchParams.get('hasta')
    const all = request.nextUrl.searchParams.get('all')

    let where: Record<string, unknown> = {}
    if (all === 'true') {
      where = { estado: { not: EstadoEmbarque.CANCELADO } }
    } else if (desde && hasta) {
      const { startDate, endDate } = getDateRange(desde, hasta)
      where = { fecha: { gte: startDate, lt: endDate }, estado: { not: EstadoEmbarque.CANCELADO } }
    } else {
      const { startOfDay, endOfDay } = getTodayRange()
      where = { fecha: { gte: startOfDay, lt: endOfDay }, estado: { not: EstadoEmbarque.CANCELADO } }
    }
    const prismaPagination = getPrismaPagination(pagination)

    const [embarquesRaw, total] = await Promise.all([
      prisma.embarque.findMany({
        where,
        include: {
          trabajador: { select: { id: true, nombre: true, capacidadKg: true } },
          ruta: { select: { id: true, nombre: true } },
          pedidos: {
            select: {
              id: true, numero: true, estado: true, canal: true, total: true, saldo: true,
              cPacaAguaPed: true, cPacaHieloPed: true, cBotellonFabPed: true, cBotellonDomPed: true,
              cBolsaAguaPed: true, cBolsaHieloPed: true,
              cliente: { select: { id: true, nombre: true, barrio: true } },
            },
          },
        },
        orderBy: { numero: 'desc' },
        ...prismaPagination,
      }),
      prisma.embarque.count({ where }),
    ])

    const embarques = embarquesRaw.map((e) => {
      const totalPacas = calcularPacasEmbarque(e.pedidos)
      const pesoKg = calcularPesoEmbarque(e.pedidos)
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

    return apiSuccess(
      pagination.all
        ? { embarques, total }
        : buildPaginationResponse(embarques, total, pagination.page!, pagination.pageSize!)
    )
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

    const trabajador = await prisma.trabajador.findUnique({
      where: { id: parsed.data.trabajadorId },
      select: { id: true, nombre: true, capacidadKg: true },
    })
    
    if (!trabajador) {
      return apiError('Trabajador no encontrado', 400)
    }
    
    const capacidadKg = trabajador.capacidadKg || 500
    const pesoEstimado = calcularPesoEmbarque([{
      cPacaAguaPed: parsed.data.pacasAgua || 0,
      cPacaHieloPed: parsed.data.pacasHielo || 0,
    }])
    
    if (pesoEstimado > capacidadKg) {
      return apiError(
        `Capacidad excedida: ${pesoEstimado.toFixed(1)}kg. Maximo ${capacidadKg}kg.`,
        400
      )
    }
    
    const embarque = await prisma.embarque.create({
      data: {
        trabajadorId: parsed.data.trabajadorId,
        rutaId: parsed.data.rutaId || null,
        horaSalida: parsed.data.horaSalida ? new Date(parsed.data.horaSalida) : null,
        estado: EstadoEmbarque.ABIERTO,
        obs: parsed.data.obs,
        pacasAgua: parsed.data.pacasAgua || 0,
        pacasHielo: parsed.data.pacasHielo || 0,
        devueltasAgua: parsed.data.devueltasAgua || 0,
        devueltasHielo: parsed.data.devueltasHielo || 0,
        rotasAgua: parsed.data.rotasAgua || 0,
        rotasHielo: parsed.data.rotasHielo || 0,
      },
      include: {
        trabajador: true,
        ruta: true,
      },
    })
    
    logAudit({
      entidad: 'Embarque',
      registroId: embarque.id,
      accion: 'CREATE',
      datos: { numero: embarque.numero, trabajadorId: embarque.trabajadorId, pacasAgua: embarque.pacasAgua, pacasHielo: embarque.pacasHielo },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    })

    return apiSuccess({ embarque }, 201)
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error creating embarque:')
    return apiError('Error creando embarque')
  }
}
