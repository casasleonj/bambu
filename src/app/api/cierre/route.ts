import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { CierreCreateSchema } from '@/lib/validators'
import { EstadoPedido, EstadoEmbarque, EstadoEntrega, EstadoFactura, MetodoPago } from '@prisma/client'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { startOfDayInBogota, endOfDayInBogota, nowInBogota } from '@/lib/date-helpers'

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const fechaParam = request.nextUrl.searchParams.get('fecha')
    const fechaStr = fechaParam || new Date().toISOString().split('T')[0]
    const startOfDay = startOfDayInBogota(fechaStr)
    const endOfDay = endOfDayInBogota(fechaStr)
    const dateRange = { gte: startOfDay, lt: endOfDay }

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
              estado: { notIn: [EstadoPedido.CANCELADO, EstadoPedido.ANULADO] },
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
          fecha: fechaStr,
          postCierre,
          horaCierre: cierreExistente.horaCierre?.toISOString() ?? null,
          netoCaja: Number(cierreExistente.netoCaja || 0),
        },
      })
    }

    // 2. Not found — calculate inside $transaction for consistency
    const [
      embarquesAbiertos,
      pedidos,
      produccion,
      gastosAgg,
      notasCredito,
      abonos,
      facturas,
      gastosDetalle,
      embarquesDetalle,
      pedidosCancelados,
      pedidosNoEntregados,
      pedidosAnulados,
      clientesNuevos,
      ventasPorOrigenRaw,
      descuentos,
    ] = await prisma.$transaction([
      prisma.embarque.findMany({
        where: { fecha: dateRange, estado: EstadoEmbarque.ABIERTO },
        select: { id: true, numero: true, trabajador: { select: { nombre: true } } },
      }),
      prisma.pedido.findMany({
        where: {
          fecha: dateRange,
          estado: { notIn: [EstadoPedido.CANCELADO, EstadoPedido.ANULADO] },
        },
        include: { pagos: true },
      }),
      prisma.produccion.findFirst({ where: { fecha: dateRange } }),
      prisma.gasto.aggregate({
        where: { fecha: dateRange },
        _sum: { monto: true },
      }),
      prisma.notaCredito.findMany({ where: { fecha: dateRange } }),
      prisma.abono.findMany({
        where: { fecha: dateRange },
        include: {
          factura: { select: { numero: true, cliente: { select: { nombre: true } } } },
          pedido: { select: { id: true } },
        },
      }),
      prisma.factura.findMany({
        where: { fecha: dateRange },
        include: { cliente: { select: { nombre: true } } },
      }),
      prisma.gasto.groupBy({
        by: ['categoria'],
        where: { fecha: dateRange },
        orderBy: { categoria: 'asc' },
        _sum: { monto: true },
        _count: true,
      }),
      prisma.embarque.findMany({
        where: { fecha: dateRange },
        include: {
          trabajador: { select: { nombre: true } },
          ruta: { select: { nombre: true } },
        },
      }),
      prisma.pedido.findMany({
        where: { fecha: dateRange, estado: EstadoPedido.CANCELADO },
      }),
      prisma.pedido.findMany({
        where: { fecha: dateRange, estadoEntrega: EstadoEntrega.NO_ENTREGADO },
      }),
      prisma.pedido.findMany({
        where: { fecha: dateRange, estado: EstadoPedido.ANULADO },
      }),
      prisma.cliente.count({ where: { createdAt: dateRange } }),
      prisma.pedido.groupBy({
        by: ['origen'],
        where: {
          fecha: dateRange,
          estado: { notIn: [EstadoPedido.CANCELADO, EstadoPedido.ANULADO] },
        },
        orderBy: { origen: 'asc' },
        _sum: { total: true },
        _count: true,
      }),
      prisma.descuentoRepartidor.findMany({
        where: { fecha: dateRange },
        include: { trabajador: { select: { nombre: true } } },
      }),
    ])

    const totalNC = notasCredito.reduce((sum, nc) => sum + Number(nc.monto), 0)
    const totalVentas = pedidos.reduce((acc, p) => acc + Number(p.total), 0) - totalNC
    const cobrado = pedidos.reduce((acc, p) => acc + Number(p.totalPagado), 0)
    const fiado = pedidos.reduce((acc, p) => acc + Number(p.saldo), 0)

    const efectivo = pedidos
      .flatMap(p => p.pagos)
      .filter(p => p.metodo === MetodoPago.EFECTIVO)
      .reduce((acc, p) => acc + Number(p.monto), 0)
    const transferencia = pedidos
      .flatMap(p => p.pagos)
      .filter(p => p.metodo === MetodoPago.TRANSFERENCIA)
      .reduce((acc, p) => acc + Number(p.monto), 0)
    const nequi = pedidos
      .flatMap(p => p.pagos)
      .filter(p => p.metodo === MetodoPago.NEQUI)
      .reduce((acc, p) => acc + Number(p.monto), 0)
    const daviplata = pedidos
      .flatMap(p => p.pagos)
      .filter(p => p.metodo === MetodoPago.DAVIPLATA)
      .reduce((acc, p) => acc + Number(p.monto), 0)
    const bono = pedidos
      .flatMap(p => p.pagos)
      .filter(p => p.metodo === MetodoPago.BONO)
      .reduce((acc, p) => acc + Number(p.monto), 0)

    const aguaVendida = pedidos.reduce((acc, p) => acc + p.cPacaAguaEnt, 0)
    const hieloVendido = pedidos.reduce((acc, p) => acc + p.cPacaHieloEnt, 0)
    const botellonVendido = pedidos.reduce(
      (acc, p) => acc + p.cBotellonFabEnt + p.cBotellonDomEnt,
      0
    )
    const bolsaAguaVendida = pedidos.reduce((acc, p) => acc + p.cBolsaAguaEnt, 0)
    const bolsaHieloVendida = pedidos.reduce((acc, p) => acc + p.cBolsaHieloEnt, 0)

    const cobroCartera = abonos.reduce((sum, a) => sum + Number(a.monto), 0)
    const cobroVentasHoy = efectivo + transferencia + nequi + daviplata + bono

    const facturasPagadas = facturas.filter(f => f.estado === EstadoFactura.PAGADA)
    const facturasParcial = facturas.filter(f => f.estado === EstadoFactura.PARCIAL)
    const facturasPorCobrar = facturas.filter(f => f.estado === EstadoFactura.EMITIDA)
    const facturasAnuladas = facturas.filter(f => f.estado === EstadoFactura.ANULADA)

    const ventasPorOrigen = ventasPorOrigenRaw.map(v => ({
      origen: v.origen,
      total: Number(v._sum?.total) || 0,
      count: v._count,
    }))

    const status = embarquesAbiertos.length > 0 ? 'INCOMPLETO' : 'COMPLETO'

    return apiSuccess({
      status,
      embarquesPendientes: embarquesAbiertos.map(e => ({
        id: e.id,
        numero: e.numero,
        repartidor: e.trabajador?.nombre,
      })),
      cierre: {
        // Financiero
        numPedidos: pedidos.length,
        totalVentas,
        cobrado,
        cobroVentasHoy,
        cobroCartera,
        fiado,
        totalNotasCredito: totalNC,

        // Métodos de pago
        efectivo,
        transferencia,
        nequi,
        daviplata,
        bono,

        // Ventas por origen
        ventasPorOrigen,

        // Facturas
        facturasEmitidas: facturas.length,
        facturasPagadasCount: facturasPagadas.length,
        facturasPagadasTotal: facturasPagadas.reduce((s, f) => s + Number(f.total), 0),
        facturasPorCobrarCount: facturasPorCobrar.length,
        facturasPorCobrarTotal: facturasPorCobrar.reduce((s, f) => s + Number(f.saldo), 0),
        facturasParcialCount: facturasParcial.length,
        facturasParcialTotal: facturasParcial.reduce((s, f) => s + Number(f.saldo), 0),
        facturasAnuladasCount: facturasAnuladas.length,
        facturas: facturas.map(f => ({
          numero: f.numero,
          cliente: f.cliente?.nombre,
          total: Number(f.total),
          saldo: Number(f.saldo),
          estado: f.estado,
        })),

        // Gastos
        totalGastos: Number(gastosAgg._sum.monto) || 0,
        gastosPorCategoria: gastosDetalle.map(g => ({
          categoria: g.categoria,
          total: Number(g._sum?.monto) || 0,
          cantidad: g._count,
        })),

        // Embarques
        embarques: embarquesDetalle.map(e => ({
          numero: e.numero,
          repartidor: e.trabajador?.nombre,
          ruta: e.ruta?.nombre,
          pacasAgua: e.pacasAgua,
          pacasHielo: e.pacasHielo,
          devueltasAgua: e.devueltasAgua,
          devueltasHielo: e.devueltasHielo,
          rotasAgua: e.rotasAgua,
          rotasHielo: e.rotasHielo,
          estado: e.estado,
        })),

        // Pedidos perdidos
        pedidosCanceladosCount: pedidosCancelados.length,
        pedidosCanceladosTotal: pedidosCancelados.reduce((s, p) => s + Number(p.total), 0),
        pedidosNoEntregadosCount: pedidosNoEntregados.length,
        pedidosNoEntregadosTotal: pedidosNoEntregados.reduce((s, p) => s + Number(p.total), 0),
        pedidosAnuladosCount: pedidosAnulados.length,
        pedidosAnuladosTotal: pedidosAnulados.reduce((s, p) => s + Number(p.total), 0),

        // Clientes
        clientesNuevos,

        // Descuentos
        descuentosRepartidorTotal: descuentos.reduce((s, d) => s + Number(d.monto), 0),
        descuentosRepartidorCount: descuentos.length,
        descuentos: descuentos.map(d => ({
          monto: Number(d.monto),
          motivo: d.motivo,
          repartidor: d.trabajador?.nombre,
        })),

        // Cierre
        netoCaja: null,

        // Stock
        aguaVendida,
        hieloVendido,
        botellonVendido,
        bolsaAguaVendida,
        bolsaHieloVendida,
        produccion: produccion
          ? {
              ...produccion,
              stockIniAgua: produccion.stockIniAgua,
              stockIniHielo: produccion.stockIniHielo,
              prodAgua: produccion.prodAgua,
              prodHielo: produccion.prodHielo,
              stockFinAgua: produccion.stockFinAgua,
              stockFinHielo: produccion.stockFinHielo,
              comSelladorAgua: Number(produccion.comSelladorAgua),
              comSelladorHielo: Number(produccion.comSelladorHielo),
              comSellTotal: Number(produccion.comSellTotal),
              comRepartidorAgua: Number(produccion.comRepartidorAgua),
              comRepartidorHielo: Number(produccion.comRepartidorHielo),
              comRepartTotal: Number(produccion.comRepartTotal),
            }
          : null,

        // Fecha
        fecha: fechaStr,

        // Arqueo
        arqueo: null,
        totalContado: null,
        diferenciaArqueo: null,

        // Cierre metadata
        horaCierre: null,

        // Post-cierre transactions
        postCierre: null,
      },
    })
  } catch (error) {
    console.error('[cierre] GET failed:', error)
    return apiError('Error interno del servidor', 500)
  }
}

import { Prisma } from '@prisma/client'

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

  const fechaStr = parsed.data.fecha || new Date().toISOString().split('T')[0]
  const startOfDay = startOfDayInBogota(fechaStr)
  const nextDay = endOfDayInBogota(fechaStr)

  const userId = (authResult.user as { id?: string } | undefined)?.id

  const MAX_RETRIES = 3
  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const cierre = await prisma.$transaction(async (tx) => {
        // 1. Advisory lock
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(7)::text`

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
          where: { fecha: { gte: startOfDay, lt: nextDay }, estado: EstadoEmbarque.ABIERTO },
        })
        if (embarquesAbiertos > 0) {
          throw new Error('EMBARQUES_ABIERTOS')
        }

        // 5. Recalculate ALL totals server-side
        const [pedidos, gastosAgg, abonos, notasCredito] = await Promise.all([
          tx.pedido.findMany({
            where: { fecha: { gte: startOfDay, lt: nextDay }, estado: { notIn: [EstadoPedido.CANCELADO, EstadoPedido.ANULADO] } },
            include: { pagos: true },
          }),
          tx.gasto.aggregate({ where: { fecha: { gte: startOfDay, lt: nextDay } }, _sum: { monto: true } }),
          tx.abono.findMany({ where: { fecha: { gte: startOfDay, lt: nextDay } } }),
          tx.notaCredito.findMany({ where: { fecha: { gte: startOfDay, lt: nextDay } } }),
        ])

        const totalNC = notasCredito.reduce((sum, nc) => sum + Number(nc.monto), 0)
        const totalVentas = pedidos.reduce((acc, p) => acc + Number(p.total), 0) - totalNC
        const cobrado = pedidos.reduce((acc, p) => acc + Number(p.totalPagado), 0)
        const fiado = pedidos.reduce((acc, p) => acc + Number(p.saldo), 0)
        const efectivo = pedidos.flatMap(p => p.pagos).filter(p => p.metodo === MetodoPago.EFECTIVO).reduce((acc, p) => acc + Number(p.monto), 0)
        const transferencia = pedidos.flatMap(p => p.pagos).filter(p => p.metodo === MetodoPago.TRANSFERENCIA).reduce((acc, p) => acc + Number(p.monto), 0)
        const nequi = pedidos.flatMap(p => p.pagos).filter(p => p.metodo === MetodoPago.NEQUI).reduce((acc, p) => acc + Number(p.monto), 0)
        const daviplata = pedidos.flatMap(p => p.pagos).filter(p => p.metodo === MetodoPago.DAVIPLATA).reduce((acc, p) => acc + Number(p.monto), 0)
        const bono = pedidos.flatMap(p => p.pagos).filter(p => p.metodo === MetodoPago.BONO).reduce((acc, p) => acc + Number(p.monto), 0)
        const cobroVentasHoy = efectivo + transferencia + nequi + daviplata + bono
        const cobroCartera = abonos.reduce((sum, a) => sum + Number(a.monto), 0)
        const gastosTotal = Number(gastosAgg._sum.monto) || 0

        // 6. Calculate netoCaja server-side
        const netoCaja = Number(parsed.data.baseDia) + cobroVentasHoy + cobroCartera - gastosTotal - Number(parsed.data.comisiones) - Number(parsed.data.salarios)

        // 7. Parse and enrich reporte snapshot
        let reporteData: Record<string, unknown> = {}
        if (parsed.data.reporte) {
          try {
            reporteData = JSON.parse(parsed.data.reporte) as Record<string, unknown>
          } catch { /* ignore invalid JSON */ }
        }
        reporteData._version = '2.0'
        reporteData.cobroVentasHoy = cobroVentasHoy
        reporteData.cobroCartera = cobroCartera
        reporteData.totalVentas = totalVentas
        reporteData.totalNotasCredito = totalNC

        // 8. Create cierre
        return tx.cierreDia.create({
          data: {
            fecha: startOfDay,
            numPedidos: pedidos.length,
            totalVentas,
            cobrado,
            fiado,
            efectivo,
            transferencia,
            nequi,
            daviplata,
            bono,
            baseDia: parsed.data.baseDia,
            comisiones: parsed.data.comisiones,
            salarios: parsed.data.salarios,
            gastos: gastosTotal,
            stockIniAgua: parsed.data.stockIniAgua,
            prodAgua: parsed.data.prodAgua,
            stockFinAgua: parsed.data.stockFinAgua,
            stockIniHielo: parsed.data.stockIniHielo,
            prodHielo: parsed.data.prodHielo,
            stockFinHielo: parsed.data.stockFinHielo,
            aguaVendida: pedidos.reduce((acc, p) => acc + p.cPacaAguaEnt, 0),
            hieloVendido: pedidos.reduce((acc, p) => acc + p.cPacaHieloEnt, 0),
            botellonVendido: pedidos.reduce((acc, p) => acc + p.cBotellonFabEnt + p.cBotellonDomEnt, 0),
            bolsaAguaVendida: pedidos.reduce((acc, p) => acc + p.cBolsaAguaEnt, 0),
            bolsaHieloVendida: pedidos.reduce((acc, p) => acc + p.cBolsaHieloEnt, 0),
            netoCaja,
            cerradoPor: userId,
            horaCierre: nowInBogota(),
            reporte: reporteData as Prisma.InputJsonValue,
          },
        })
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 15000,
      })

      // 9. Audit log (outside transaction)
      logAudit({
        entidad: 'CierreDia',
        registroId: cierre.id,
        accion: 'CREATE',
        datos: { fecha: cierre.fecha, totalVentas: cierre.totalVentas, cerradoPor: userId },
        usuarioId: userId,
      }).catch((e) => console.error('[cierre] Audit log failed:', e))

      return apiSuccess({ cierre }, 201)

    } catch (error) {
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
