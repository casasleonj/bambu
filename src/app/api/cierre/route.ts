import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { CierreCreateSchema } from '@/lib/validators'
import { EstadoEmbarque, EstadoEntrega, EstadoFactura, MetodoPago } from '@prisma/client'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { getTodayString } from '@/lib/dates'
import { startOfDayInBogota, endOfDayInBogota, nowInBogota } from '@/lib/date-helpers'
import { notifyEvent } from '@/lib/notifications/notify-event'
import { NotificationEventType } from '@/lib/notifications/event-types'
import { acquireAdvisoryLockTx } from '@/lib/locks'

type PagoMetodoMonto = { metodo: MetodoPago; monto: unknown }
type DiasPreviosAgg = { _count: number; _sum: { monto: unknown } }

/**
 * ADR-PAGO-REPORTADO-CONFIRMADO-001 §6 — desglose informativo de pagos sin
 * confirmar para el reporte de cierre. Una sola pasada sobre los pagos.
 */
function buildPorConfirmar(pagosHoy: PagoMetodoMonto[], diasPrevios: DiasPreviosAgg) {
  const porMetodo: Record<string, number> = {
    EFECTIVO: 0, TRANSFERENCIA: 0, NEQUI: 0, DAVIPLATA: 0, BONO: 0,
  }
  let total = 0
  for (const p of pagosHoy) {
    const m = Number(p.monto)
    total += m
    if (p.metodo in porMetodo) porMetodo[p.metodo] += m
  }
  return {
    total,
    count: pagosHoy.length,
    porMetodo,
    diasPreviosCount: diasPrevios._count,
    diasPreviosTotal: Number(diasPrevios._sum.monto ?? 0),
  }
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  try {
    const fechaParam = request.nextUrl.searchParams.get('fecha')
    const fechaStr = fechaParam || getTodayString()
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
      correccionesAbonoAgg,
      pagosReportadosHoyRaw,
      reportadosDiasPreviosAgg,
      pagosCapturadosHoy,
    ] = await prisma.$transaction([
      prisma.embarque.findMany({
        where: { fecha: dateRange, estado: EstadoEmbarque.ABIERTO },
        select: { id: true, numero: true, trabajador: { select: { nombre: true } } },
      }),
      prisma.pedido.findMany({
        where: {
          fecha: dateRange,
          estadoEntrega: { notIn: [EstadoEntrega.CANCELADO, EstadoEntrega.ANULADO] },
        },
        // F-B: los métodos de pago ya no salen de aquí (ver `pagosCapturadosHoy`).
      }),
      prisma.produccion.findFirst({
        where: { fecha: dateRange },
        include: { items: true },
      }),
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
        where: { fecha: dateRange, estadoEntrega: EstadoEntrega.CANCELADO },
      }),
      prisma.pedido.findMany({
        where: { fecha: dateRange, estadoEntrega: EstadoEntrega.NO_ENTREGADO },
      }),
      prisma.pedido.findMany({
        where: { fecha: dateRange, estadoEntrega: EstadoEntrega.ANULADO },
      }),
      prisma.cliente.count({ where: { createdAt: dateRange } }),
      prisma.pedido.groupBy({
        by: ['origen'],
        where: {
          fecha: dateRange,
          estadoEntrega: { notIn: [EstadoEntrega.CANCELADO, EstadoEntrega.ANULADO] },
        },
        orderBy: { origen: 'asc' },
        _sum: { total: true },
        _count: true,
      }),
      prisma.descuentoRepartidor.findMany({
        where: { fecha: dateRange },
        include: { trabajador: { select: { nombre: true } } },
      }),
      // ADR-CORRECCION-MONETARIA-001: las reversiones restan del cobro de
      // cartera del día AL QUE PERTENECE EL ABONO (por `abono.fecha`, no por
      // `createdAt` de la corrección). Así `cobroCartera` de hoy nunca queda
      // negativo (corrección <= abono, ambos del mismo día) y una corrección
      // de un abono viejo se refleja en el cierre de ESE día (al recomputarlo),
      // no descuadra el de hoy.
      prisma.correccionAbono.aggregate({
        where: { abono: { fecha: dateRange } },
        _sum: { montoRevertido: true },
      }),
      // ADR-PAGO-REPORTADO-CONFIRMADO-001 §6: pagos REPORTADO cobrados HOY (por
      // `pago.createdAt`, no por `pedido.fecha` — un pago de fiado de hoy sobre
      // un pedido viejo también cuenta).
      prisma.pago.findMany({
        where: { confirmacion: 'REPORTADO', createdAt: dateRange },
        select: { metodo: true, monto: true },
      }),
      // ...y los REPORTADO de días anteriores (advertencia, no bloquea).
      prisma.pago.aggregate({
        where: { confirmacion: 'REPORTADO', createdAt: { lt: startOfDay } },
        _sum: { monto: true },
        _count: true,
      }),
      // F-B (auditoría #181): la CAJA del día se concilia por FECHA DE CAPTURA
      // del pago (`Pago.createdAt`), no por `pedido.fecha`. Un efectivo cobrado
      // hoy en un cierre de embarque sobre un pedido de días anteriores entró
      // físicamente a la caja de hoy. Ventas/producto/facturas siguen por
      // `pedido.fecha` (más abajo). Se excluyen los pagos de pedidos
      // ANULADO/CANCELADO (efecto neto $0 — misma regla que el cierre de
      // embarque).
      prisma.pago.findMany({
        where: {
          createdAt: dateRange,
          pedido: { estadoEntrega: { notIn: [EstadoEntrega.CANCELADO, EstadoEntrega.ANULADO] } },
        },
        select: { metodo: true, monto: true },
      }),
    ])

    const totalNC = notasCredito.reduce((sum, nc) => sum + Number(nc.monto), 0)
    const totalVentas = pedidos.reduce((acc, p) => acc + Number(p.total), 0) - totalNC
    const cobrado = pedidos.reduce((acc, p) => acc + Number(p.totalPagado), 0)
    const fiado = pedidos.reduce((acc, p) => acc + Number(p.saldo), 0)

    // F-B: métodos de pago = CAJA, por fecha de captura (`pagosCapturadosHoy`),
    // no por `pedido.pagos` (que sería por `pedido.fecha`).
    const cajaPorMetodo: Record<string, number> = {
      [MetodoPago.EFECTIVO]: 0,
      [MetodoPago.TRANSFERENCIA]: 0,
      [MetodoPago.NEQUI]: 0,
      [MetodoPago.DAVIPLATA]: 0,
      [MetodoPago.BONO]: 0,
    }
    for (const pg of pagosCapturadosHoy) {
      if (pg.metodo in cajaPorMetodo) cajaPorMetodo[pg.metodo] += Number(pg.monto)
    }
    const efectivo = cajaPorMetodo[MetodoPago.EFECTIVO]
    const transferencia = cajaPorMetodo[MetodoPago.TRANSFERENCIA]
    const nequi = cajaPorMetodo[MetodoPago.NEQUI]
    const daviplata = cajaPorMetodo[MetodoPago.DAVIPLATA]
    const bono = cajaPorMetodo[MetodoPago.BONO]

    const aguaVendida = pedidos.reduce((acc, p) => acc + p.cPacaAguaEnt, 0)
    const hieloVendido = pedidos.reduce((acc, p) => acc + p.cPacaHieloEnt, 0)
    const botellonVendido = pedidos.reduce(
      (acc, p) => acc + p.cBotellonFabEnt + p.cBotellonDomEnt,
      0
    )
    const bolsaAguaVendida = pedidos.reduce((acc, p) => acc + p.cBolsaAguaEnt, 0)
    const bolsaHieloVendida = pedidos.reduce((acc, p) => acc + p.cBolsaHieloEnt, 0)

    const cobroCartera =
      abonos.reduce((sum, a) => sum + Number(a.monto), 0) -
      Number(correccionesAbonoAgg._sum.montoRevertido ?? 0)
    const cobroVentasHoy = efectivo + transferencia + nequi + daviplata + bono

    // ADR-PAGO-REPORTADO-CONFIRMADO-001 §6: desglose INFORMATIVO de pagos aún
    // REPORTADO cobrados HOY. NO altera netoCaja — el cierre suma todos los
    // pagos por método como siempre.
    const porConfirmar = buildPorConfirmar(pagosReportadosHoyRaw, reportadosDiasPreviosAgg)

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

    // Transformar ProduccionItem a campos planos para el response (backward compat)
    const produccionFlat = produccion
      ? {
          ...produccion,
          items: undefined,
          stockIniAgua:
            produccion.items.find(i => i.producto === 'PACA_AGUA')?.stockIni ?? 0,
          stockIniHielo:
            produccion.items.find(i => i.producto === 'PACA_HIELO')?.stockIni ?? 0,
          prodAgua: produccion.items.find(i => i.producto === 'PACA_AGUA')?.producido ?? 0,
          prodHielo:
            produccion.items.find(i => i.producto === 'PACA_HIELO')?.producido ?? 0,
          stockFinAgua:
            produccion.items.find(i => i.producto === 'PACA_AGUA')?.stockFinFisico ?? 0,
          stockFinHielo:
            produccion.items.find(i => i.producto === 'PACA_HIELO')?.stockFinFisico ?? 0,
          comSelladorAgua: Number(
            produccion.items.find(i => i.producto === 'PACA_AGUA')?.comSellador ?? 0
          ),
          comSelladorHielo: Number(
            produccion.items.find(i => i.producto === 'PACA_HIELO')?.comSellador ?? 0
          ),
          comSellTotal: Number(
            produccion.items.reduce((sum, i) => sum + Number(i.comSellador || 0), 0)
          ),
          // Comisiones de repartidor viven en Produccion.comRepartTotal
          // (son agregación de Pedidos entregados por ese trabajador, no por item)
          comRepartidorAgua: 0,
          comRepartidorHielo: 0,
          comRepartTotal: Number(produccion.comRepartTotal),
        }
      : null

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

        // ADR-PAGO-REPORTADO-CONFIRMADO-001 §6 — informativo, no altera netoCaja.
        porConfirmar,

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
        produccion: produccionFlat,

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

  const fechaStr = parsed.data.fecha || getTodayString()
  const startOfDay = startOfDayInBogota(fechaStr)
  const nextDay = endOfDayInBogota(fechaStr)

  const userId = (authResult.user as { id?: string } | undefined)?.id

  // ADR-PAGO-REPORTADO-CONFIRMADO-001 §6: info de pagos sin confirmar (solo
  // warning) — lectura FUERA de la tx Serializable del cierre para no ampliar
  // su predicate-lock set (esta consulta escanea todo el histórico REPORTADO).
  const [pagosReportadosHoyRaw, reportadosDiasPreviosAgg] = await Promise.all([
    prisma.pago.findMany({
      where: { confirmacion: 'REPORTADO', createdAt: { gte: startOfDay, lt: nextDay } },
      select: { metodo: true, monto: true },
    }),
    prisma.pago.aggregate({
      where: { confirmacion: 'REPORTADO', createdAt: { lt: startOfDay } },
      _sum: { monto: true },
      _count: true,
    }),
  ])
  const porConfirmar = buildPorConfirmar(pagosReportadosHoyRaw, reportadosDiasPreviosAgg)

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
          where: { fecha: { gte: startOfDay, lt: nextDay }, estado: { in: [EstadoEmbarque.ABIERTO, EstadoEmbarque.EN_RUTA] } },
        })
        if (embarquesAbiertos > 0) {
          throw new Error('EMBARQUES_ABIERTOS')
        }

        // 5. Recalculate ALL totals server-side
        const [pedidos, gastosAgg, abonos, notasCredito, correccionesAbonoAgg, pagosCapturadosHoy] = await Promise.all([
          tx.pedido.findMany({
            where: { fecha: { gte: startOfDay, lt: nextDay }, estadoEntrega: { notIn: [EstadoEntrega.CANCELADO, EstadoEntrega.ANULADO] } },
            // F-B: los métodos de pago ya no salen de aquí (ver `pagosCapturadosHoy`).
          }),
          tx.gasto.aggregate({ where: { fecha: { gte: startOfDay, lt: nextDay } }, _sum: { monto: true } }),
          tx.abono.findMany({ where: { fecha: { gte: startOfDay, lt: nextDay } } }),
          tx.notaCredito.findMany({ where: { fecha: { gte: startOfDay, lt: nextDay } } }),
          // ADR-CORRECCION-MONETARIA-001: reversiones de abonos de ESTE día
          // (por `abono.fecha`) → restan del cobro de cartera. Ver nota en el GET.
          tx.correccionAbono.aggregate({
            where: { abono: { fecha: { gte: startOfDay, lt: nextDay } } },
            _sum: { montoRevertido: true },
          }),
          // F-B (auditoría #181): la CAJA se concilia por fecha de captura del
          // pago (`Pago.createdAt`), no por `pedido.fecha`. Ver nota en el GET.
          tx.pago.findMany({
            where: {
              createdAt: { gte: startOfDay, lt: nextDay },
              pedido: { estadoEntrega: { notIn: [EstadoEntrega.CANCELADO, EstadoEntrega.ANULADO] } },
            },
            select: { metodo: true, monto: true },
          }),
        ])

        const totalNC = notasCredito.reduce((sum, nc) => sum + Number(nc.monto), 0)
        const totalVentas = pedidos.reduce((acc, p) => acc + Number(p.total), 0) - totalNC
        const cobrado = pedidos.reduce((acc, p) => acc + Number(p.totalPagado), 0)
        const fiado = pedidos.reduce((acc, p) => acc + Number(p.saldo), 0)

        // F-B: métodos de pago = CAJA, por fecha de captura (`pagosCapturadosHoy`).
        const totalesPorMetodo: Record<string, number> = {
          [MetodoPago.EFECTIVO]: 0,
          [MetodoPago.TRANSFERENCIA]: 0,
          [MetodoPago.NEQUI]: 0,
          [MetodoPago.DAVIPLATA]: 0,
          [MetodoPago.BONO]: 0,
        }
        for (const pago of pagosCapturadosHoy) {
          if (pago.metodo in totalesPorMetodo) {
            totalesPorMetodo[pago.metodo] = (totalesPorMetodo[pago.metodo] || 0) + Number(pago.monto)
          }
        }
        const efectivo = totalesPorMetodo[MetodoPago.EFECTIVO]
        const transferencia = totalesPorMetodo[MetodoPago.TRANSFERENCIA]
        const nequi = totalesPorMetodo[MetodoPago.NEQUI]
        const daviplata = totalesPorMetodo[MetodoPago.DAVIPLATA]
        const bono = totalesPorMetodo[MetodoPago.BONO]
        const cobroVentasHoy = efectivo + transferencia + nequi + daviplata + bono
        const cobroCartera =
          abonos.reduce((sum, a) => sum + Number(a.monto), 0) -
          Number(correccionesAbonoAgg._sum.montoRevertido ?? 0)
        const gastosTotal = Number(gastosAgg._sum.monto) || 0
        // ADR-PAGO-REPORTADO-CONFIRMADO-001 §6 — `porConfirmar` calculado arriba,
        // fuera de la tx (informativo, no altera netoCaja).

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
        reporteData.porConfirmar = porConfirmar
        reporteData.totalVentas = totalVentas
        reporteData.totalNotasCredito = totalNC

        // 8. Create cierre
        const nuevoCierre = await tx.cierreDia.create({
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
