import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { CierreCreateSchema } from '@/lib/validators'
import { EstadoEmbarque, EstadoEntrega, Prisma } from '@prisma/client'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { getTodayString } from '@/lib/dates'
import { startOfDayInBogota, nowInBogota } from '@/lib/date-helpers'
import { notifyEvent } from '@/lib/notifications/notify-event'
import { NotificationEventType } from '@/lib/notifications/event-types'
import { acquireAdvisoryLockTx } from '@/lib/locks'
import { whereEmbarquesPendientesCierreDia } from '@/lib/cierre-dia-embarques'
import { CobrosSinConciliarError } from '@/lib/cobro-cartera'
import { construirResumenCierre } from '@/lib/cierre-resumen'
import { calcularNetoCierre } from '@/lib/cierre-totales'
import { leerArqueoDeclarado } from '@/lib/cierre-arqueo'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const fechaParam = request.nextUrl.searchParams.get('fecha')
    const fechaStr = fechaParam || getTodayString()
    const startOfDay = startOfDayInBogota(fechaStr)
    const endOfDay = new Date(startOfDay.getTime() + 86_400_000)

    // 1. Check for existing cierre FIRST
    const cierreExistente = await prisma.cierreDia.findUnique({
      where: { fecha: startOfDay },
    })

    if (cierreExistente?.reporte) {
      const reporteGuardado =
        typeof cierreExistente.reporte === 'string'
          ? JSON.parse(cierreExistente.reporte)
          : cierreExistente.reporte

      // Apply defaults for v1.0 snapshots that may be missing new fields
      const reporte = {
        cobroVentasHoy: 0,
        cobroCartera: 0,
        porConfirmar: { total: 0, count: 0, porMetodo: {}, diasPreviosCount: 0, diasPreviosTotal: 0 },
        totalNotasCredito: 0,
        ventasPorOrigen: [],
        facturasEmitidas: 0,
        facturasPagadasCount: 0,
        facturasPagadasTotal: 0,
        facturasPorCobrarCount: 0,
        facturasPorCobrarTotal: 0,
        facturasParcialCount: 0,
        facturasParcialTotal: 0,
        facturasAnuladasCount: 0,
        facturas: [],
        totalGastos: 0,
        gastosPorCategoria: [],
        embarques: [],
        pedidosCanceladosCount: 0,
        pedidosCanceladosTotal: 0,
        pedidosNoEntregadosCount: 0,
        pedidosNoEntregadosTotal: 0,
        pedidosAnuladosCount: 0,
        pedidosAnuladosTotal: 0,
        clientesNuevos: 0,
        descuentosRepartidorTotal: 0,
        descuentosRepartidorCount: 0,
        descuentos: [],
        trabajadores: [],
        arqueo: null,
        totalContado: null,
        diferenciaArqueo: null,
        _version: '1.0',
        ...reporteGuardado,
      }

      // Post-cierre: transactions after horaCierre
      let postCierre = null
      if (cierreExistente.horaCierre) {
        const hc = cierreExistente.horaCierre
        const [pedidosPost, embarquesPost, gastosPost] = await Promise.all([
          prisma.pedido.findMany({
            where: {
              fecha: { gte: hc, lt: endOfDay },
              estadoEntrega: { notIn: [EstadoEntrega.CANCELADO, EstadoEntrega.ANULADO] },
            },
            include: { pagos: true, cliente: { select: { nombre: true } } },
          }),
          prisma.embarque.findMany({
            where: {
              fecha: { gte: hc, lt: endOfDay },
              estado: { not: EstadoEmbarque.CANCELADO },
            },
            include: {
              trabajador: { select: { nombre: true } },
              ruta: { select: { nombre: true } },
            },
          }),
          prisma.gasto.findMany({
            where: { fecha: { gte: hc, lt: endOfDay } },
          }),
        ])
        postCierre = {
          pedidos: pedidosPost.map(p => ({
            id: p.id,
            numero: p.numero,
            cliente: p.cliente?.nombre,
            total: Number(p.total),
            totalPagado: Number(p.totalPagado),
            saldo: Number(p.saldo),
            estadoEntrega: p.estadoEntrega,
            origen: p.origen,
            pagos: p.pagos.map(pg => ({ metodo: pg.metodo, monto: Number(pg.monto) })),
          })),
          embarques: embarquesPost.map(e => ({
            numero: e.numero,
            repartidor: e.trabajador?.nombre,
            ruta: e.ruta?.nombre,
            pacasAgua: e.pacasAgua,
            pacasHielo: e.pacasHielo,
            estado: e.estado,
          })),
          gastos: gastosPost.map(g => ({
            categoria: g.categoria,
            descripcion: g.descripcion,
            monto: Number(g.monto),
          })),
        }
      }

      return apiSuccess({
        status: 'CERRADO',
        embarquesPendientes: [],
        cierre: {
          ...reporte,
          numPedidos: cierreExistente.numPedidos,
          totalVentas: Number(cierreExistente.totalVentas),
          cobrado: Number(cierreExistente.cobrado), fiado: Number(cierreExistente.fiado),
          efectivo: Number(cierreExistente.efectivo), transferencia: Number(cierreExistente.transferencia),
          nequi: Number(cierreExistente.nequi), daviplata: Number(cierreExistente.daviplata), bono: Number(cierreExistente.bono),
          totalGastos: Number(cierreExistente.gastos), baseDia: Number(cierreExistente.baseDia),
          salarios: Number(cierreExistente.salarios), comisiones: Number(cierreExistente.comisiones),
          fecha: fechaStr,
          postCierre,
          horaCierre: cierreExistente.horaCierre?.toISOString() ?? null,
          netoCaja: Number(cierreExistente.netoCaja || 0),
        },
      })
    }

    const resumen = await prisma.$transaction(
      tx => construirResumenCierre(tx, fechaStr),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 },
    )
    return apiSuccess(resumen)
  } catch (error) {
    if (error instanceof CobrosSinConciliarError) return apiError(error.message, 409, {
      code: error.code, cobrosPendientes: error.cobros.map(({ referencia, importe }) => ({ referencia, importe })),
    })
    console.error('[cierre] GET failed:', error)
    return apiError('Error interno del servidor', 500)
  }
}


export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole(['ADMIN', 'ASISTENTE'], authResult)
  if (roleCheck instanceof Response) return roleCheck

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('JSON inválido', 400)
  }

  const parsed = CierreCreateSchema.safeParse(body)
  if (!parsed.success) {
    return apiError(formatZodError(parsed.error), 400)
  }

  const fechaStr = parsed.data.fecha || getTodayString()
  const startOfDay = startOfDayInBogota(fechaStr)
  const nextDay = new Date(startOfDay.getTime() + 86_400_000)

  const userId = (authResult.user as { id?: string } | undefined)?.id

  const MAX_RETRIES = 3
  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const cierre = await prisma.$transaction(async (tx) => {
        // 1. Advisory lock por día (ADR-CONCURRENCIA-001, §6 "Cierre").
        await acquireAdvisoryLockTx(tx, 'CIERRE', startOfDay.toISOString())

        // 2. Validate sequence inside lock
        const lastCierre = await tx.cierreDia.findFirst({ orderBy: { fecha: 'desc' } })
        if (lastCierre) {
          const lastDate = new Date(lastCierre.fecha)
          const reqDate = new Date(startOfDay)
          const diffDays = Math.floor((reqDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
          if (diffDays <= 0) {
            throw new Error('CIERRE_DUPLICADO')
          }
          if (diffDays > 1) {
            throw new Error('CIERRE_HUECO')
          }
        }

        // 3. Double-check no cierre exists for this date
        const existing = await tx.cierreDia.findUnique({ where: { fecha: startOfDay } })
        if (existing) {
          throw new Error('CIERRE_YA_EXISTE')
        }

        // 4. Verify no open embarques
        const embarquesAbiertos = await tx.embarque.count({
          where: whereEmbarquesPendientesCierreDia({ gte: startOfDay, lt: nextDay }),
        })
        if (embarquesAbiertos > 0) {
          throw new Error('EMBARQUES_ABIERTOS')
        }

        // #511/#513: el snapshot completo sale del mismo resumen que el preview,
        // dentro de esta transacción. No se guardan cifras aportadas por el navegador.
        const { cierre: resumen } = await construirResumenCierre(tx, fechaStr)
        const { totalVentas, cobrado, fiado, efectivo, transferencia, nequi, daviplata, bono, cobroVentasHoy, cobroCartera } = resumen
        const gastosTotal = resumen.totalGastos
        const comisiones = resumen.comisionesAuto
        const netoCaja = calcularNetoCierre({
          baseDia: parsed.data.baseDia, cobroVentasHoy, cobroCartera,
          totalGastos: gastosTotal, comisiones: comisiones.total, salarios: parsed.data.salarios,
        })
        const arqueo = leerArqueoDeclarado(parsed.data.reporte, netoCaja)
        const reporteData = {
          ...resumen, ...arqueo, _version: '2.1', netoCaja,
          baseDia: parsed.data.baseDia, salarios: parsed.data.salarios, comisiones: comisiones.total,
        }

        // 8. Create cierre
        const nuevoCierre = await tx.cierreDia.create({
          data: {
            fecha: startOfDay,
            numPedidos: resumen.numPedidos,
            totalVentas,
            cobrado,
            fiado,
            efectivo,
            transferencia,
            nequi,
            daviplata,
            bono,
            baseDia: parsed.data.baseDia,
            comisiones: comisiones.total,
            salarios: parsed.data.salarios,
            gastos: gastosTotal,
            stockIniAgua: parsed.data.stockIniAgua,
            prodAgua: parsed.data.prodAgua,
            stockFinAgua: parsed.data.stockFinAgua,
            stockIniHielo: parsed.data.stockIniHielo,
            prodHielo: parsed.data.prodHielo,
            stockFinHielo: parsed.data.stockFinHielo,
            aguaVendida: resumen.aguaVendida,
            hieloVendido: resumen.hieloVendido,
            botellonVendido: resumen.botellonVendido,
            bolsaAguaVendida: resumen.bolsaAguaVendida,
            bolsaHieloVendida: resumen.bolsaHieloVendida,
            netoCaja,
            cerradoPor: userId,
            horaCierre: nowInBogota(),
            reporte: JSON.parse(JSON.stringify(reporteData)) as Prisma.InputJsonValue,
          },
        })

        // 9. Audit — F1 (ADR-CONCURRENCIA-001 / contrato §51): dentro de la
        // MISMA transacción del cierre. Antes corría post-commit con
        // `.catch(console.error)` → un cierre podía quedar sin evidencia.
        // Si la auditoría falla, el cierre hace rollback atómico.
        await logAudit({
          entidad: 'CierreDia',
          registroId: nuevoCierre.id,
          accion: 'CREATE',
          datos: { fecha: nuevoCierre.fecha, totalVentas: nuevoCierre.totalVentas, cerradoPor: userId },
          usuarioId: userId,
        }, tx)

        return nuevoCierre
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 15000,
      })

      void notifyEvent(NotificationEventType.CIERRE_DIA_COMPLETADO, {
        title: 'Cierre del día completado',
        body: `Se cerró el día ${cierre.fecha.toISOString().slice(0, 10)}. Total ventas: $${Number(cierre.totalVentas).toLocaleString()}.`,
        url: `/cierre?fecha=${cierre.fecha.toISOString().slice(0, 10)}`,
        tag: `cierre-${cierre.id}`,
      })

      return apiSuccess({ cierre }, 201)

    } catch (error) {
      if (error instanceof CobrosSinConciliarError) return apiError(error.message, 409, {
        code: error.code, cobrosPendientes: error.cobros.map(({ referencia, importe }) => ({ referencia, importe })),
      })
      if (error instanceof Error && error.message.startsWith('Arqueo inválido')) return apiError(error.message, 400)
      lastError = error instanceof Error ? error : new Error(String(error))

      // P2034 = write conflict, retry
      if (lastError.message.includes('P2034')) {
        if (attempt < MAX_RETRIES - 1) continue
      }

      // Known business errors
      if (lastError.message === 'CIERRE_DUPLICADO') {
        return apiError('No se puede cerrar un día anterior o igual al último cierre registrado', 400)
      }
      if (lastError.message === 'CIERRE_HUECO') {
        return apiError('Hay días sin cerrar entre el último cierre y esta fecha. Ciérralos primero.', 400)
      }
      if (lastError.message === 'CIERRE_YA_EXISTE') {
        return apiError('Ya existe un cierre para esta fecha', 409)
      }
      if (lastError.message === 'EMBARQUES_ABIERTOS') {
        return apiError('Hay embarques abiertos que deben cerrarse primero', 400)
      }

      break
    }
  }

  console.error('[cierre] POST failed after retries:', lastError)
  return apiError('Error interno del servidor', 500)
}
