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
import { captureApiError, addApiBreadcrumb } from '@/lib/sentry-helpers'

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
      include: { trabajador: true, items: true },
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
  const userRol = (authResult.user as { rol?: string } | undefined)?.rol
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')
    ?? null
  const userAgent = request.headers.get('user-agent') ?? null

  addApiBreadcrumb('produccion.POST start', { userId, hasBody: true })

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

  // Parsear items: separar por producto
  const itemAgua = parsed.data.items.find(i => i.producto === 'PACA_AGUA')!
  const itemHielo = parsed.data.items.find(i => i.producto === 'PACA_HIELO')!

  const prodAgua = Math.round((itemAgua.conteoA + itemAgua.conteoB) / 2)
  const prodHielo = Math.round((itemHielo.conteoA + itemHielo.conteoB) / 2)

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
  const perdidasAgua = itemAgua.rotas + itemAgua.filtradas + itemAgua.consumoInterno
  const perdidasHielo = itemHielo.rotas + itemHielo.filtradas + itemHielo.consumoInterno
  const stockFinEsperadoAgua = stockIniAgua + prodAgua - ventas.aguaVendida
  const stockFinEsperadoHielo = stockIniHielo + prodHielo - ventas.hieloVendido
  const diferenciaAgua = stockFinEsperadoAgua - itemAgua.stockFinFisico - perdidasAgua
  const diferenciaHielo = stockFinEsperadoHielo - itemHielo.stockFinFisico - perdidasHielo
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
          // FIX 1.1: advisory lock para serializar inserciones concurrentes.
          // Usamos ReadCommitted (default) porque el lock ya serializa.
          // Serializable + advisory lock juntos causan P2034 innecesarios.
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(${PROD_ADVISORY_LOCK_KEY}::int)::text`

          // Re-validar duplicado dentro del lock (defense in depth).
          // Como el lock se libera al hacer COMMIT, los requests posteriores
          // verán el registro creado.
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

          // Stock fin esperado por item
          const stockFinEsperadoAgua = stockIniAgua + prodAgua - ventas.aguaVendida
          const stockFinEsperadoHielo = stockIniHielo + prodHielo - ventas.hieloVendido

          return tx.produccion.create({
            data: {
              fecha: fechaProduccion,
              turno: parsed.data.turno,
              trabajadorId: parsed.data.trabajadorId,
              createdById: userId, // FIX 1.4
              comSellTotal: comSell.total,
              comRepartTotal: comRepartTotal,
              obs: obsTrim || null,
              // Bloque 2: crear 2 ProduccionItem (PACA_AGUA, PACA_HIELO)
              items: {
                create: [
                  {
                    producto: 'PACA_AGUA',
                    conteoA: itemAgua.conteoA,
                    conteoB: itemAgua.conteoB,
                    producido: prodAgua,
                    stockIni: stockIniAgua,
                    ventas: ventas.aguaVendida,
                    stockFinEsperado: stockFinEsperadoAgua,
                    stockFinFisico: itemAgua.stockFinFisico,
                    diferencia: diferenciaAgua,
                    filtradas: itemAgua.filtradas,
                    rotas: itemAgua.rotas,
                    consumoInterno: itemAgua.consumoInterno,
                    comSellador: comSell.comAgua,
                  },
                  {
                    producto: 'PACA_HIELO',
                    conteoA: itemHielo.conteoA,
                    conteoB: itemHielo.conteoB,
                    producido: prodHielo,
                    stockIni: stockIniHielo,
                    ventas: ventas.hieloVendido,
                    stockFinEsperado: stockFinEsperadoHielo,
                    stockFinFisico: itemHielo.stockFinFisico,
                    diferencia: diferenciaHielo,
                    filtradas: itemHielo.filtradas,
                    rotas: itemHielo.rotas,
                    consumoInterno: itemHielo.consumoInterno,
                    comSellador: comSell.comHielo,
                  },
                ],
              },
            },
            include: { trabajador: true, items: true },
          })
        },
        {
          // ReadCommitted es suficiente: el advisory lock serializa.
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
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
          prodAgua,
          prodHielo,
          diferenciaAgua,
          diferenciaHielo,
          obs: produccion.obs,
          items: produccion.items.map(i => ({
            producto: i.producto,
            producido: i.producido,
            stockFinFisico: i.stockFinFisico,
            diferencia: i.diferencia,
          })),
        },
        usuarioId: userId,
        ip,
        userAgent,
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

  // FIX 1.1 fallback: si llegamos aquí tras retries y existe un duplicado,
  // es una race condition. Devolvemos 409 en vez de 500.
  try {
    const dup = await prisma.produccion.findFirst({
      where: {
        trabajadorId: parsed.data.trabajadorId,
        fecha: { gte: startOfDay, lt: endOfDay },
        turno: parsed.data.turno,
      },
    })
    if (dup) {
      return apiError(
        `Ya existe producción registrada para este trabajador en el turno ${parsed.data.turno} de hoy`,
        409,
      )
    }
  } catch {
    // ignore - fall through to 500
  }

  logger.error(
    { err: lastError?.message || 'Unknown' },
    'Error creating produccion after retries:',
  )
  // Capturar a Sentry con contexto de producción
  captureApiError(lastError ?? new Error('Unknown produccion POST error'), {
    endpoint: 'produccion.POST',
    rol: userRol,
    userId: userId ?? undefined,
    extra: { turno: parsed.data.turno, attempt: MAX_RETRIES },
  })
  return apiError('Error al registrar la producción', 500)
}
