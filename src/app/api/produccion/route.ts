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
import { calcComSellador, itemBotellon } from '@/lib/comisiones'
import { getTodayRange, getDateRange } from '@/lib/dates'
import { motivoFechaProduccionInvalida } from '@/lib/produccion-fecha'
import { netoPrevioDelDia } from '@/lib/produccion-previas'
import { startOfDayInBogota, todayInBogota } from '@/lib/date-helpers'
import { captureApiError, addApiBreadcrumb } from '@/lib/sentry-helpers'
import { publishRealtimeEvent } from '@/lib/realtime'
import { acquireAdvisoryLockTx } from '@/lib/locks'
import { resolverStockInicial } from '@/lib/stock-inicial'

const MAX_RETRIES = 3

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole([ROLES.ADMIN], authResult)
  if (roleCheck instanceof Response) return roleCheck
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

  // FASE 1 (ADR-IDEMPOTENCIA-001): el dedup por offlineId se movió DENTRO del
  // lock. Antes corría acá con el cliente global, fuera del $transaction → dos
  // requests concurrentes con el mismo offlineId pasaban el findUnique (null)
  // y el segundo caía en P2002 → 409 no idempotente. Ahora el dedup corre
  // dentro del lock (ver callback del $transaction).

  // Parsear items: separar por producto
  const itemAgua = parsed.data.items.find(i => i.producto === 'PACA_AGUA')!
  const itemHielo = parsed.data.items.find(i => i.producto === 'PACA_HIELO')!

  const prodAgua = Math.round((itemAgua.conteoA + itemAgua.conteoB) / 2)
  const prodHielo = Math.round((itemHielo.conteoA + itemHielo.conteoB) / 2)

  // FIX 1.6: fecha truncada a medianoche Bogotá para que
  // @@unique([trabajadorId, fecha, turno]) funcione como "1 por día"
  // #645: con `fecha` (cierre atrasado) la producción se registra en ese día, hasta 7 días atrás y nunca en el futuro.
  const hoy = todayInBogota()
  const diaProduccion = parsed.data.fecha ?? hoy
  if (parsed.data.fecha) {
    const motivo = motivoFechaProduccionInvalida(diaProduccion, hoy)
    if (motivo === 'FECHA_FUTURA') return apiError('No se puede registrar producción de un día que no ha llegado', 422, { code: motivo })
    if (motivo) return apiError('Solo se registra producción de hoy y de los 7 días anteriores', 422, { code: motivo })
  }
  const fechaProduccion = startOfDayInBogota(diaProduccion)
  const { startDate: startOfDay, endDate: endOfDay } = getDateRange(diaProduccion, diaProduccion)

  // #645: un día ya cerrado no admite producción nueva (cambiaría un cierre ya guardado).
  const cierreDelDia = await prisma.cierreDia.findFirst({ where: { fecha: fechaProduccion }, select: { id: true } })
  if (cierreDelDia) return apiError('Ese día ya está cerrado: no se puede registrar producción', 409, { code: 'DIA_CERRADO' })

  // Re-leemos ventas adentro del handler para mayor fidelidad (pueden cambiar
  // entre el preview y el POST)
  const [stockInicial, ventas, previas] = await Promise.all([
    resolverStockInicial(prisma, parsed.data.fecha ? fechaProduccion : undefined),
    getVentasDelDia(parsed.data.fecha ? new Date(fechaProduccion.getTime() + 12 * 3_600_000) : undefined),
    // #645: varias producciones el mismo día (otro sellador u otro turno)
    prisma.produccion.findMany({
      where: { fecha: fechaProduccion },
      select: { trabajadorId: true, turno: true, items: { select: { producto: true, producido: true, rotas: true, filtradas: true, consumoInterno: true } } },
    }),
  ])

  // #645: «Jornada completa» no convive con otro turno del mismo sellador ese día.
  const conflictoJornada = (prev: typeof previas) => prev
    .filter((p) => p.trabajadorId === parsed.data.trabajadorId)
    .some((p) => (parsed.data.turno === 'JORNADA') !== (p.turno === 'JORNADA'))
  if (conflictoJornada(previas)) {
    return apiError('Ese sellador ya tiene producción ese día con otro tipo de turno: la jornada completa no se combina con mañana, tarde o noche', 409, { code: 'JORNADA_CON_OTRO_TURNO' })
  }

  // FIX 1.5: validar server-side que obs esté presente si hay diferencia
  const perdidasAgua = itemAgua.rotas + itemAgua.filtradas + itemAgua.consumoInterno
  const perdidasHielo = itemHielo.rotas + itemHielo.filtradas + itemHielo.consumoInterno

  // #645: el stock del día es uno solo. Con producciones previas del mismo día, lo que ya produjeron (menos sus pérdidas)
  // pasa a ser parte del stock inicial de esta, para que el cuadre del día no cuente dos veces ni olvide nada.
  // #668: se calcula DOS veces — acá para avisar pronto, y otra vez dentro del lock con lo que haya en ese momento, que es lo
  // que se guarda. Si no, dos selladores a la vez guardarían el mismo inicial sin ver lo del otro.
  const cuadrar = (prev: typeof previas, base: Awaited<ReturnType<typeof resolverStockInicial>>) => {
    const stockIniAgua = base.stockIniAgua + netoPrevioDelDia(prev, 'PACA_AGUA')
    const stockIniHielo = base.stockIniHielo + netoPrevioDelDia(prev, 'PACA_HIELO')
    // #618: botellones llenos (sin pérdidas): lo llenado por las producciones anteriores del día suma al inicial.
    const stockIniBotellon = base.stockIniBotellon + netoPrevioDelDia(prev, 'BOTELLON')
    const stockFinEsperadoAgua = stockIniAgua + prodAgua - ventas.aguaVendida
    const stockFinEsperadoHielo = stockIniHielo + prodHielo - ventas.hieloVendido
    const diferenciaAgua = stockFinEsperadoAgua - itemAgua.stockFinFisico - perdidasAgua
    const diferenciaHielo = stockFinEsperadoHielo - itemHielo.stockFinFisico - perdidasHielo
    // #618: inventario de botellones llenos. Sin conteo se asume que cuadra (clientes anteriores).
    const stockFinEsperadoBotellon = stockIniBotellon + parsed.data.botellonesLlenados - ventas.botellonVendido
    const stockFinFisicoBotellon = parsed.data.stockFinBotellones ?? stockFinEsperadoBotellon
    const itemBot = itemBotellon(parsed.data.botellonesLlenados, 0, ventas.botellonVendido, { stockIni: stockIniBotellon, stockFinFisico: stockFinFisicoBotellon })
    const diferenciaBotellon = stockFinEsperadoBotellon - stockFinFisicoBotellon
    const hayDiferencia = diferenciaAgua !== 0 || diferenciaHielo !== 0 || diferenciaBotellon !== 0
    return {
      stockIniAgua, stockIniHielo, stockFinEsperadoAgua, stockFinEsperadoHielo, diferenciaAgua, diferenciaHielo, itemBot, hayDiferencia,
    }
  }
  const { hayDiferencia } = cuadrar(previas, stockInicial)
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
      const { produccion, deduped } = await prisma.$transaction(
        async (tx) => {
          // FIX 1.1: advisory lock para serializar inserciones concurrentes.
          // Usamos ReadCommitted (default) porque el lock ya serializa.
          // Serializable + advisory lock juntos causan P2034 innecesarios.
          // FASE 0 (ADR-CONCURRENCIA-001): lock `SECUENCIA:produccion` en lugar
          // del entero fijo 8 (que colisionaba con NC).
          await acquireAdvisoryLockTx(tx, 'SECUENCIA', 'produccion')

          // FASE 1 (ADR-IDEMPOTENCIA-001): dedup por offlineId DENTRO del lock.
          // Un replay con el mismo offlineId retorna el registro existente sin
          // re-crear ni caer en P2002.
          if (parsed.data.offlineId) {
            const existente = await tx.produccion.findUnique({
              where: { offlineId: parsed.data.offlineId },
              include: { items: true, trabajador: true },
            })
            if (existente) {
              return { deduped: true as const, produccion: existente }
            }
          }

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

          // #668: lo que se guarda se calcula AQUÍ, con el lock tomado y lo que ya esté confirmado. Lo calculado antes del lock
          // pudo quedar viejo si otro sellador guardó entre la lectura y este punto.
          const previasTx = await tx.produccion.findMany({
            where: { fecha: fechaProduccion },
            select: { trabajadorId: true, turno: true, items: { select: { producto: true, producido: true, rotas: true, filtradas: true, consumoInterno: true } } },
          })
          if (conflictoJornada(previasTx)) throw new Error('JORNADA_CON_OTRO_TURNO')
          const baseTx = await resolverStockInicial(tx, parsed.data.fecha ? fechaProduccion : undefined)
          const cuadre = cuadrar(previasTx, baseTx)
          if (cuadre.hayDiferencia && obsTrim === '') throw new Error('OBS_REQUERIDA')

          const trabajador = await tx.trabajador.findUnique({
            where: { id: parsed.data.trabajadorId },
            select: {
              comPacaAgua: true,
              comPacaHielo: true,
              comBotellon: true,
              rol: true,
            },
          })

          if (!trabajador) {
            throw new Error('TRABAJADOR_NO_ENCONTRADO')
          }
          if (trabajador.rol !== 'SELLADOR') {
            throw new Error('TRABAJADOR_NO_SELLADOR')
          }

          // #645: el sellador comisiona por los botellones LLENADOS (los que digita), no por los vendidos.
          const comSell = calcComSellador(prodAgua, prodHielo, trabajador, parsed.data.botellonesLlenados)

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
            comRepartAgua += entregasAgua * Number(e.trabajador.comRepartAgua)
            comRepartHielo += entregasHielo * Number(e.trabajador.comRepartHielo)
          }
          const comRepartTotal = comRepartAgua + comRepartHielo

          return { deduped: false as const, produccion: await tx.produccion.create({
            data: {
              fecha: fechaProduccion,
              turno: parsed.data.turno,
              trabajadorId: parsed.data.trabajadorId,
              createdById: userId, // FIX 1.4
              comSellTotal: comSell.total,
              comRepartTotal: comRepartTotal,
              obs: obsTrim || null,
              offlineId: parsed.data.offlineId ?? null, // Bloque 5
              // Bloque 2: crear 2 ProduccionItem (PACA_AGUA, PACA_HIELO)
              items: {
                create: [
                  {
                    producto: 'PACA_AGUA',
                    conteoA: itemAgua.conteoA,
                    conteoB: itemAgua.conteoB,
                    producido: prodAgua,
                    stockIni: cuadre.stockIniAgua,
                    ventas: ventas.aguaVendida,
                    stockFinEsperado: cuadre.stockFinEsperadoAgua,
                    stockFinFisico: itemAgua.stockFinFisico,
                    diferencia: cuadre.diferenciaAgua,
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
                    stockIni: cuadre.stockIniHielo,
                    ventas: ventas.hieloVendido,
                    stockFinEsperado: cuadre.stockFinEsperadoHielo,
                    stockFinFisico: itemHielo.stockFinFisico,
                    diferencia: cuadre.diferenciaHielo,
                    filtradas: itemHielo.filtradas,
                    rotas: itemHielo.rotas,
                    consumoInterno: itemHielo.consumoInterno,
                    comSellador: comSell.comHielo,
                  },
                  // #645: botellones llenados (los vendidos del día quedan como referencia; sin ciclo de stock).
                  { ...cuadre.itemBot, comSellador: comSell.comBotellon },
                ],
              },
            },
            include: { trabajador: true, items: true },
          }) }
        },
        {
          // ReadCommitted es suficiente: el advisory lock serializa.
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: 5000,
          timeout: 15000,
        },
      )

      if (deduped) {
        addApiBreadcrumb('produccion.POST dedup hit', { offlineId: parsed.data.offlineId })
        return apiSuccess({ produccion, deduped: true }, 200)
      }

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
          diferenciaAgua: produccion.items.find((i) => i.producto === 'PACA_AGUA')?.diferencia,
          diferenciaHielo: produccion.items.find((i) => i.producto === 'PACA_HIELO')?.diferencia,
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

      publishRealtimeEvent('produccion.created', produccion.id).catch(() => {})

      return apiSuccess({ produccion }, 201)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // P2034 = write conflict, retry
      if (lastError.message.includes('P2034')) {
        if (attempt < MAX_RETRIES - 1) continue
      }

      if (lastError.message === 'PRODUCCION_DUPLICADA') {
        return apiError(
          `Ya existe producción registrada para este trabajador en el turno ${parsed.data.turno} de ese día`,
          409,
        )
      }
      if (lastError.message === 'JORNADA_CON_OTRO_TURNO') {
        return apiError('Ese sellador ya tiene producción ese día con otro tipo de turno: la jornada completa no se combina con mañana, tarde o noche', 409, { code: 'JORNADA_CON_OTRO_TURNO' })
      }
      if (lastError.message === 'OBS_REQUERIDA') {
        return apiError('Si hay diferencia de stock debés explicar la causa en observaciones', 400)
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
        `Ya existe producción registrada para este trabajador en el turno ${parsed.data.turno} de ese día`,
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
