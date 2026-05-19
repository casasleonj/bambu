import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ProduccionCreateSchema } from '@/lib/validators'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { getVentasDelDia } from '@/lib/ventas'
import { calcComSellador } from '@/lib/comisiones'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const { searchParams } = new URL(request.url)
    const fecha = searchParams.get('fecha')

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const where = fecha
      ? {
          fecha: {
            gte: new Date(`${fecha}T00:00:00`),
            lt: new Date(`${fecha}T23:59:59.999`),
          },
        }
      : {
          fecha: {
            gte: today,
            lt: tomorrow,
          },
        }

    const registros = await prisma.produccion.findMany({
      where,
      orderBy: { turno: 'asc' },
      include: { trabajador: true },
    })
    return apiSuccess({ produccion: registros })
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error fetching produccion:')
    return apiError('Error', 500)
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN], authResult)
  if (roleCheck instanceof Response) return roleCheck
  try {
    const body = await request.json()
    const parsed = ProduccionCreateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const prodAgua = Math.round((parsed.data.conteoAAgua + parsed.data.conteoBAgua) / 2)
    const prodHielo = Math.round((parsed.data.conteoAHielo + parsed.data.conteoBHielo) / 2)

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const existing = await prisma.produccion.findFirst({
      where: {
        trabajadorId: parsed.data.trabajadorId,
        fecha: { gte: today, lt: new Date(today.getTime() + 86400000) },
        turno: parsed.data.turno,
      },
    })
    if (existing) {
      return apiError(`Ya existe producción registrada para este trabajador en el turno ${parsed.data.turno} de hoy`, 409)
    }

    const ultimoCierre = await prisma.cierreDia.findFirst({
      orderBy: { fecha: 'desc' },
    })

    const stockIniAgua = ultimoCierre?.stockFinAgua || 0
    const stockIniHielo = ultimoCierre?.stockFinHielo || 0

    const ventas = await getVentasDelDia()

    const stockFinAgua = stockIniAgua + prodAgua - ventas.aguaVendida
    const stockFinHielo = stockIniHielo + prodHielo - ventas.hieloVendido

    const trabajador = await prisma.trabajador.findUnique({
      where: { id: parsed.data.trabajadorId },
      select: { comPacaAgua: true, comPacaHielo: true, comRepartAgua: true, comRepartHielo: true, rol: true },
    })

    if (!trabajador) {
      return apiError('Trabajador no encontrado', 400)
    }

    if (trabajador.rol !== 'SELLADOR') {
      return apiError('El trabajador seleccionado no tiene rol de SELLADOR', 400)
    }

    const comSell = trabajador
      ? calcComSellador(prodAgua, prodHielo, trabajador)
      : { comAgua: 0, comHielo: 0, total: 0 }

    const embarquesHoy = await prisma.embarque.findMany({
      where: {
        fecha: {
          gte: today,
          lt: new Date(today.getTime() + 86400000),
        },
        estado: 'CERRADO',
      },
      select: {
        pacasAgua: true,
        pacasHielo: true,
        devueltasAgua: true,
        devueltasHielo: true,
        rotasAgua: true,
        rotasHielo: true,
        trabajador: {
          select: { comPacaAgua: true, comPacaHielo: true, comRepartAgua: true, comRepartHielo: true, usaMoto: true },
        },
      },
    })

    let comRepartAgua = 0
    let comRepartHielo = 0
    for (const e of embarquesHoy) {
      if (!e.trabajador.usaMoto) continue
      const entregasAgua = Math.max(0, e.pacasAgua - e.devueltasAgua - e.rotasAgua)
      const entregasHielo = Math.max(0, e.pacasHielo - e.devueltasHielo - e.rotasHielo)
      comRepartAgua += entregasAgua * Number(e.trabajador.comRepartAgua || e.trabajador.comPacaAgua)
      comRepartHielo += entregasHielo * Number(e.trabajador.comRepartHielo || e.trabajador.comPacaHielo)
    }
    const comRepartTotal = comRepartAgua + comRepartHielo

    const produccion = await prisma.produccion.create({
      data: {
        turno: parsed.data.turno,
        trabajadorId: parsed.data.trabajadorId,
        stockIniAgua,
        stockIniHielo,
        conteoAAgua: parsed.data.conteoAAgua,
        conteoBAgua: parsed.data.conteoBAgua,
        conteoAHielo: parsed.data.conteoAHielo,
        conteoBHielo: parsed.data.conteoBHielo,
        prodAgua,
        prodHielo,
        ventasAgua: ventas.aguaVendida,
        ventasHielo: ventas.hieloVendido,
        stockFinAgua,
        stockFinHielo,
        stockFinFisicoAgua: parsed.data.stockFinFisicoAgua,
        stockFinFisicoHielo: parsed.data.stockFinFisicoHielo,
        filtradasAgua: parsed.data.filtradasAgua,
        filtradasHielo: parsed.data.filtradasHielo,
        rotasAgua: parsed.data.rotasAgua,
        rotasHielo: parsed.data.rotasHielo,
        consumoInternoAgua: parsed.data.consumoInternoAgua,
        consumoInternoHielo: parsed.data.consumoInternoHielo,
        comSelladorAgua: comSell.comAgua,
        comSelladorHielo: comSell.comHielo,
        comSellTotal: comSell.total,
        comRepartidorAgua: comRepartAgua,
        comRepartidorHielo: comRepartHielo,
        comRepartTotal: comRepartTotal,
        obs: parsed.data.obs,
      },
      include: { trabajador: true },
    })
    logAudit({
      entidad: 'Produccion',
      registroId: produccion.id,
      accion: 'CREATE',
      datos: { fecha: produccion.fecha, tipo: produccion.turno },
      usuarioId: (authResult.user as { id?: string } | undefined)?.id,
    }).catch(() => {})

    return apiSuccess({ produccion }, 201)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'P2002') {
      return apiError('Ya existe producción registrada para este trabajador y turno hoy', 409)
    }
    logger.error({ err: error instanceof Error ? error.message : 'Unknown' }, 'Error creating produccion:')
    return apiError('Error', 500)
  }
}
