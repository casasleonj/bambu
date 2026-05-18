import { formatZodError } from '@/lib/utils'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, requireRole } from '@/lib/auth-check'
import { CierreCreateSchema } from '@/lib/validators'
import { withAdvisoryLock } from '@/lib/locks'
import { EstadoPedido, EstadoEmbarque, EstadoEntrega, EstadoFactura, MetodoPago } from '@prisma/client'
import { apiSuccess, apiError } from '@/lib/api-response'
import { logAudit } from '@/lib/audit'
import { startOfDayInBogota, endOfDayInBogota } from '@/lib/date-helpers'

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
          ...reporteGuardado,
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

export async function POST(request: NextRequest) {
  const authResult = await requireAuth()
  if (authResult instanceof Response) return authResult
  const roleCheck = await requireRole(['ADMIN', 'ASISTENTE'], authResult)
  if (roleCheck instanceof Response) return roleCheck
  try {
    const body = await request.json()
    const parsed = CierreCreateSchema.safeParse(body)
    if (!parsed.success) {
      return apiError(formatZodError(parsed.error), 400)
    }

    const fechaStr = parsed.data.fecha || new Date().toISOString().split('T')[0]

    // 0. Validar secuencia de cierres: no se puede cerrar un día si hay días anteriores sin cerrar
    const lastCierre = await prisma.cierreDia.findFirst({
      orderBy: { fecha: 'desc' },
    })
    if (lastCierre) {
      const lastDate = new Date(lastCierre.fecha)
      const reqDate = new Date(fechaStr)
      const diffMs = reqDate.getTime() - lastDate.getTime()
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
      if (diffDays <= 0) {
        return apiError('No se puede cerrar un día anterior o igual al último cierre registrado', 400)
      }
      if (diffDays > 1) {
        return apiError(`Hay ${diffDays - 1} día(s) sin cerrar entre el último cierre (${lastDate.toISOString().split('T')[0]}) y esta fecha. Cerralos primero.`, 400)
      }
    }
    const startOfDay = new Date(fechaStr + 'T00:00:00.000Z')
    const nextDay = new Date(startOfDay)
    nextDay.setDate(nextDay.getDate() + 1)

    // Block if there are open embarques
    const embarquesAbiertos = await prisma.embarque.count({
      where: {
        fecha: { gte: startOfDay, lt: nextDay },
        estado: EstadoEmbarque.ABIERTO,
      },
    })

    if (embarquesAbiertos > 0) {
      return apiError(
        `No se puede cerrar el día ${fechaStr}: ${embarquesAbiertos} embarque(s) pendiente(s) de empalme`,
        400
      )
    }

    // Calculate netoCaja server-side — never trust client for financial totals
    const cobros = parsed.data.efectivo + parsed.data.transferencia + parsed.data.nequi + parsed.data.daviplata + parsed.data.bono
    const netoCaja = parsed.data.baseDia + cobros - parsed.data.gastos - parsed.data.comisiones - parsed.data.salarios
    const reporteSnapshot = parsed.data.reporte ? JSON.parse(parsed.data.reporte) : null

    const userId = (authResult.user as { id?: string } | undefined)?.id

    const cierre = await withAdvisoryLock('CIERRE', async () => {
      // Double-check no cierre exists for this date under lock
      const existing = await prisma.cierreDia.findFirst({
        where: {
          fecha: { gte: startOfDay, lt: nextDay },
        },
      })
      if (existing) {
        throw new Error('CIERRE_YA_EXISTE')
      }

      return prisma.cierreDia.create({
        data: {
          fecha: startOfDay,
          numPedidos: parsed.data.numPedidos,
          totalVentas: parsed.data.totalVentas,
          cobrado: parsed.data.cobrado,
          fiado: parsed.data.fiado,
          efectivo: parsed.data.efectivo,
          transferencia: parsed.data.transferencia,
          nequi: parsed.data.nequi,
          daviplata: parsed.data.daviplata,
          bono: parsed.data.bono,
          baseDia: parsed.data.baseDia,
          comisiones: parsed.data.comisiones,
          salarios: parsed.data.salarios,
          gastos: parsed.data.gastos,
          stockIniAgua: parsed.data.stockIniAgua,
          prodAgua: parsed.data.prodAgua,
          stockFinAgua: parsed.data.stockFinAgua,
          stockIniHielo: parsed.data.stockIniHielo,
          prodHielo: parsed.data.prodHielo,
          stockFinHielo: parsed.data.stockFinHielo,
          netoCaja,
          cerradoPor: userId,
          horaCierre: new Date(),
          reporte: reporteSnapshot,
        },
      })
    })

    logAudit({
      entidad: 'CierreDia',
      registroId: cierre.id,
      accion: 'CREATE',
      datos: { fecha: cierre.fecha, totalVentas: cierre.totalVentas, cerradoPor: userId },
      usuarioId: userId,
    }).catch((e) => console.error('[cierre] Audit log failed:', e))

    return apiSuccess({ cierre }, 201)
  } catch (error) {
    if (error instanceof Error && error.message === 'CIERRE_YA_EXISTE') {
      return apiError('Ya existe un cierre para esta fecha', 409)
    }
    return apiError('Error interno del servidor', 500)
  }
}
