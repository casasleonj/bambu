import { Prisma, EstadoEntrega, EstadoFactura, MetodoPago } from '@prisma/client'
import { startOfDayInBogota } from '@/lib/date-helpers'
import { whereEmbarquesPendientesCierreDia } from '@/lib/cierre-dia-embarques'
import { comisionesDelCierre } from '@/lib/comision-pagada'
import { resumirAbonosDelDia } from '@/lib/cobro-cartera'
import { resumirVentasCierre } from '@/lib/cierre-totales'

type PagoMetodoMonto = { metodo: MetodoPago; monto: unknown }
type DiasPreviosAgg = { _count: number; _sum: { monto: unknown } }

/**
 * ADR-PAGO-REPORTADO-CONFIRMADO-001 §6 — desglose informativo de pagos sin
 * confirmar para el reporte de cierre. Una sola pasada sobre los pagos.
 */
export function buildPorConfirmar(pagosHoy: PagoMetodoMonto[], diasPrevios: DiasPreviosAgg) {
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


/** #511/#513: único resumen financiero, siempre leído del servidor. */
export async function construirResumenCierre(prisma: Prisma.TransactionClient, fechaStr: string) {
  const startOfDay = startOfDayInBogota(fechaStr)
  const endOfDay = new Date(startOfDay.getTime() + 86_400_000)
  const dateRange = { gte: startOfDay, lt: endOfDay }
    const [
      embarquesAbiertos,
      pedidos,
      produccion,
      gastosAgg,
      notasCredito,
      facturas,
      gastosDetalle,
      embarquesDetalle,
      pedidosCancelados,
      pedidosNoEntregados,
      pedidosAnulados,
      clientesNuevos,
      ventasPorOrigenRaw,
      descuentos,
      pagosReportadosHoyRaw,
      reportadosDiasPreviosAgg,
      pagosCapturadosHoy,
    ] = await Promise.all([
      prisma.embarque.findMany({
        where: whereEmbarquesPendientesCierreDia(dateRange),
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
      prisma.notaCredito.findMany({ where: { fecha: dateRange }, include: { pedido: { select: { fecha: true } } } }),
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
      // ADR-PAGO-REPORTADO-CONFIRMADO-001 §6: pagos REPORTADO cobrados HOY (por
      // `pago.createdAt`, no por `pedido.fecha` — un pago de fiado de hoy sobre
      // un pedido viejo también cuenta).
      prisma.pago.findMany({
        where: { confirmacion: 'REPORTADO', createdAt: dateRange, regularizacionId: null },
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
          // #402: un pago de regularización describe un cobro de otro día; no
          // entró a la caja del día en que se registró.
          regularizacionId: null,
          pedido: { estadoEntrega: { notIn: [EstadoEntrega.CANCELADO, EstadoEntrega.ANULADO] } },
        },
        select: { metodo: true, monto: true },
      }),
    ])

    // #499: comisiones del día calculadas por el servidor (repartidores con lo pagado/pendiente + sellador).
    const comisionesAuto = await comisionesDelCierre(prisma, fechaStr, startOfDay, endOfDay)

    const ventas = resumirVentasCierre(pedidos, notasCredito, startOfDay)
    const { totalVentas, totalNotasCredito: totalNC } = ventas
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

    // #513: el Abono espejo de pagar-fiado ya está en `cobroVentasHoy` (su Pago); no se cuenta dos veces.
    const abonos = await resumirAbonosDelDia(prisma, startOfDay, endOfDay)
    const cobroCartera = abonos.total
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

    return {
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
        abonosIndependientes: abonos.abonosIndependientes,
        ajustesDeCobros: abonos.ajustesDeCobros,
        fiado,
        totalNotasCredito: totalNC,
        ventasDePedidosDelDia: ventas.ventasDePedidosDelDia,
        notasCreditoVentasAnteriores: ventas.notasCreditoVentasAnteriores,
        notasCreditoSinAjusteVentas: ventas.notasCreditoSinAjusteVentas,

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
        comisionesAuto: {
          sellador: comisionesAuto.sellador,
          pagadoRepartidores: comisionesAuto.pagadoRepartidores,
          total: comisionesAuto.total,
          repartidores: comisionesAuto.repartidores.map((r) => ({
            trabajadorId: r.trabajadorId, nombre: r.nombre, total: r.total, pagado: r.pagado, pendiente: r.pendiente,
          })),
        },

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
    }
}
