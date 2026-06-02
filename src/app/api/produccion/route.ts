import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { ProduccionCreateSchema } from '@/lib/validators'
import { ROLES } from '@/lib/constants'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { logger } from '@/lib/logger'
import { getVentasDelDia } from '@/lib/ventas'
import { calcComSellador } from '@/lib/comisiones'
import { getTodayRange, getDateRange } from '@/lib/dates'
import { startOfDayInBogota, todayInBogota } from '@/lib/date-helpers'

// FIX 1.1: advisory lock key dedicado a producción. Cierre usa 7.
const PROD_ADVISORY_LOCK_KEY = 8

const MAX_RETRIES = 3

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const { searchParams } = new URL(request.url)
    const fecha = searchParams.get('fecha')

    const where = fecha
      ? (() => {
          const { startDate, endDate } = getDateRange(fecha, fecha)
          return { fecha: { gte: startDate, lt: endDate } }
        })()
      : (() => {
          const { startOfDay, endOfDay } = getTodayRange()
          return { fecha: { gte: startOfDay, lt: endOfDay } }
        })()

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

  const userId = (authResult.user as { id?: string } | undefined)?.id

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('JSON inválido', 400)
  }

  const parsed = ProduccionCreateSchema.safeParse(body)
  if (!parsed.success) {
    return apiError(formatZodError(parsed.error), 400)
  }

  const prodAgua = Math.round((parsed.data.conteoAAgua + parsed.data.conteoBAgua) / 2)
  const prodHielo = Math.round((parsed.data.conteoAHielo + parsed.data.conteoBHielo) / 2)

  // FIX 1.6: fecha truncada a medianoche Bogotá para que
  // @@unique([trabajadorId, fecha, turno]) funcione como "1 por día"
  const fechaProduccion = startOfDayInBogota(todayInBogota())
  const { startOfDay, endOfDay } = getTodayRange()

  // Re-leemos ventas adentro del handler para mayor fidelidad (pueden cambiar
  // entre el preview y el POST)
  const [ultimoCierre, ventas] = await Promise.all([
    prisma.cierreDia.findFirst({ orderBy: { fecha: 'desc' } }),
    getVentasDelDia(),
  ])

  const stockIniAgua = ultimoCierre?.stockFinAgua || 0
  const stockIniHielo = ultimoCierre?.stockFinHielo || 0

  // FIX 1.5: validar server-side que obs esté presente si hay diferencia
  const perdidasAgua =
    (parsed.data.rotasAgua || 0) +
    (parsed.data.filtradasAgua || 0) +
    (parsed.data.consumoInternoAgua || 0)
  const perdidasHielo =
    (parsed.data.rotasHielo || 0) +
    (parsed.data.filtradasHielo || 0) +
    (parsed.data.consumoInternoHielo || 0)
  const stockFinEsperadoAgua = stockIniAgua + prodAgua - ventas.aguaVendida
  const stockFinEsperadoHielo = stockIniHielo + prodHielo - ventas.hieloVendido
  const diferenciaAgua = stockFinEsperadoAgua - parsed.data.stockFinFisicoAgua - perdidasAgua
  const diferenciaHielo = stockFinEsperadoHielo - parsed.data.stockFinFisicoHielo - perdidasHielo
  const hayDiferencia = diferenciaAgua !== 0 || diferenciaHielo !== 0
  const obsTrim = (parsed.data.obs || '').trim()

  if (hayDiferencia && obsTrim === '') {
    return apiError(
      'Si hay diferencia de stock debés explicar la causa en observaciones',
      400,
    )
  }

  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const produccion = await prisma.$transaction(
        async (tx) => {
          // FIX 1.1: advisory lock para serializar inserciones concurrentes
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(${PROD_ADVISORY_LOCK_KEY}::int)::text`

          // Re-validar duplicado dentro del lock (defense in depth)
          const existing = await tx.produccion.findFirst({
            where: {
              trabajadorId: parsed.data.trabajadorId,
              fecha: { gte: startOfDay, lt: endOfDay },
              turno: parsed.data.turno,
            },
          })
          if (existing) {
            throw new Error('PRODUCCION_DUPLICADA')
          }

          const trabajador = await tx.trabajador.findUnique({
            where: { id: parsed.data.trabajadorId },
            select: {
              comPacaAgua: true,
              comPacaHielo: true,
              comRepartAgua: true,
              comRepartHielo: true,
              rol: true,
            },
          })

          if (!trabajador) {
            throw new Error('TRABAJADOR_NO_ENCONTRADO')
          }
          if (trabajador.rol !== 'SELLADOR') {
            throw new Error('TRABAJADOR_NO_SELLADOR')
          }

          const comSell = calcComSellador(prodAgua, prodHielo, trabajador)

          const embarquesHoy = await tx.embarque.findMany({
            where: {
              fecha: { gte: startOfDay, lt: endOfDay },
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
                select: {
                  comPacaAgua: true,
                  comPacaHielo: true,
                  comRepartAgua: true,
                  comRepartHielo: true,
                  usaMoto: true,
                },
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

          const stockFinAgua = stockIniAgua + prodAgua - ventas.aguaVendida
          const stockFinHielo = stockIniHielo + prodHielo - ventas.hieloVendido

          return tx.produccion.create({
            data: {
              fecha: fechaProduccion,
              turno: parsed.data.turno,
              trabajadorId: parsed.data.trabajadorId,
              createdById: userId, // FIX 1.4
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
              obs: obsTrim || null,
            },
            include: { trabajador: true },
          })
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5000,
          timeout: 15000,
        },
      )

      // FIX 4.1: audit log detallado
      logAudit({
        entidad: 'Produccion',
        registroId: produccion.id,
        accion: 'CREATE',
        datos: {
          fecha: produccion.fecha,
          turno: produccion.turno,
          prodAgua: produccion.prodAgua,
          prodHielo: produccion.prodHielo,
          diferenciaAgua,
          diferenciaHielo,
          obs: produccion.obs,
        },
        usuarioId: userId,
      }).catch(() => {})

      return apiSuccess({ produccion }, 201)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // P2034 = write conflict, retry
      if (lastError.message.includes('P2034')) {
        if (attempt < MAX_RETRIES - 1) continue
      }

      if (lastError.message === 'PRODUCCION_DUPLICADA') {
        return apiError(
          `Ya existe producción registrada para este trabajador en el turno ${parsed.data.turno} de hoy`,
          409,
        )
      }
      if (lastError.message === 'TRABAJADOR_NO_ENCONTRADO') {
        return apiError('Trabajador no encontrado', 400)
      }
      if (lastError.message === 'TRABAJADOR_NO_SELLADOR') {
        return apiError('El trabajador seleccionado no tiene rol de SELLADOR', 400)
      }

      // P2002 = unique constraint
      if (
        error !== null &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        return apiError(
          'Ya existe producción registrada para este trabajador y turno hoy',
          409,
        )
      }

      break
    }
  }

  logger.error(
    { err: lastError?.message || 'Unknown' },
    'Error creating produccion after retries:',
  )
  return apiError('Error al registrar la producción', 500)
}
