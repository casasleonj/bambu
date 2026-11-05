import { Prisma, EstadoEntrega, EstadoFactura, MetodoPago } from '@prisma/client'
import { sueldosPendientesAl } from '@/lib/sueldos-pendientes'
import { startOfDayInBogota } from '@/lib/date-helpers'
import { whereEmbarquesPendientesCierreDia } from '@/lib/cierre-dia-embarques'
import { comisionesDelCierre } from '@/lib/comision-pagada'
import { resumirAbonosDelDia } from '@/lib/cobro-cartera'
import { resumirVentasCierre } from '@/lib/cierre-totales'
import { logger } from '@/lib/logger'
import { unidadesEntregadasDelDia } from '@/lib/unidades-entregadas-dia'
import { resolverStockInicial } from '@/lib/stock-inicial'
import { PAGO_DE_PEDIDO_VIGENTE } from '@/lib/pago-confirmacion'
import { desglosarCobros, detallarPorConfirmar, listarFiadosDelDia } from '@/lib/cierre-desglose-cobros'

type PagoMetodoMonto = { metodo: MetodoPago; monto: unknown }

/** #631: máximo de filas del detalle de pagos por confirmar de días anteriores (el total no se recorta). */
const LIMITE_DETALLE_POR_CONFIRMAR = 50
const SELECT_POR_CONFIRMAR = {
  id: true, metodo: true, monto: true, createdAt: true,
  pedido: { select: { id: true, numero: true, cliente: { select: { id: true, nombre: true, apellido: true } }, factura: { select: { numero: true } } } },
} satisfies Prisma.PagoSelect
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
      reportadosDiasPreviosRaw,
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
        // #631: el nombre del cliente es para la lista «A quién se fió hoy».
        include: { cliente: { select: { nombre: true, apellido: true } } },
        // F-B: los métodos de pago ya no salen de aquí (ver `pagosCapturadosHoy`).
      }),
      // #645: puede haber varias producciones el mismo día (otro sellador u otro turno); el cierre las suma.
      prisma.produccion.findMany({
        where: { fecha: dateRange },
        include: { items: true, trabajador: { select: { nombre: true } } },
        orderBy: { createdAt: 'asc' },
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
        where: { confirmacion: 'REPORTADO', createdAt: dateRange, regularizacionId: null, ...PAGO_DE_PEDIDO_VIGENTE },
        select: SELECT_POR_CONFIRMAR,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      // ...y los REPORTADO de días anteriores (advertencia, no bloquea).
      prisma.pago.aggregate({
        where: { confirmacion: 'REPORTADO', createdAt: { lt: startOfDay }, ...PAGO_DE_PEDIDO_VIGENTE },
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
        // #631: la fecha del pedido separa «ventas de hoy» de «fiados de días anteriores cobrados hoy».
        select: { metodo: true, monto: true, pedido: { select: { fecha: true } } },
      }),
      // #631: detalle de los REPORTADO de días anteriores (los más recientes; el total sigue siendo el agregado).
      prisma.pago.findMany({
        where: { confirmacion: 'REPORTADO', createdAt: { lt: startOfDay }, ...PAGO_DE_PEDIDO_VIGENTE },
        select: SELECT_POR_CONFIRMAR,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: LIMITE_DETALLE_POR_CONFIRMAR,
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

    // #650 (2b): unidades vendidas = entregadas ese día (no creadas ese día). Misma función que Producción y dashboard.
    // Si el reparto por día falla, el cierre no se cae: usa lo acumulado por fecha de creación y lo avisa.
    let unidadesError = false
    const unidades = await unidadesEntregadasDelDia(prisma, { desde: startOfDay, hasta: endOfDay }).catch((err) => {
      unidadesError = true
      logger.error({ err, fechaStr }, 'cierre: no se pudo repartir las unidades por día de entrega')
      return {
        agua: pedidos.reduce((t, p) => t + p.cPacaAguaEnt, 0),
        hielo: pedidos.reduce((t, p) => t + p.cPacaHieloEnt, 0),
        botellon: pedidos.reduce((t, p) => t + p.cBotellonFabEnt + p.cBotellonDomEnt, 0),
        bolsaAgua: pedidos.reduce((t, p) => t + p.cBolsaAguaEnt, 0),
        bolsaHielo: pedidos.reduce((t, p) => t + p.cBolsaHieloEnt, 0),
        aproximados: [],
      }
    })
    const aguaVendida = unidades.agua
    const hieloVendido = unidades.hielo
    const botellonVendido = unidades.botellon
    const bolsaAguaVendida = unidades.bolsaAgua
    const bolsaHieloVendida = unidades.bolsaHielo
    const unidadesAproximadas = unidades.aproximados

    // #513: el Abono espejo de pagar-fiado ya está en `cobroVentasHoy` (su Pago); no se cuenta dos veces.
    const abonos = await resumirAbonosDelDia(prisma, startOfDay, endOfDay)
    const cobroCartera = abonos.total
    const cobroVentasHoy = efectivo + transferencia + nequi + daviplata + bono
    // #601: lo que entró en la caja física (efectivo) y lo que llegó por medios digitales.
    const cobroCarteraEfectivo = abonos.totalEfectivo
    const cobroEfectivoHoy = efectivo + cobroCarteraEfectivo
    const cobroDigitalHoy = (cobroVentasHoy - efectivo) + (cobroCartera - cobroCarteraEfectivo)

    // ADR-PAGO-REPORTADO-CONFIRMADO-001 §6: desglose INFORMATIVO de pagos aún
    // REPORTADO cobrados HOY. NO altera netoCaja — el cierre suma todos los
    // pagos por método como siempre.
    const porConfirmar = {
      ...buildPorConfirmar(pagosReportadosHoyRaw, reportadosDiasPreviosAgg),
      // #631: detalle para listar pedido, cliente, factura y fecha de cada pago.
      detalleHoy: detallarPorConfirmar(pagosReportadosHoyRaw),
      detalleDiasPrevios: detallarPorConfirmar(reportadosDiasPreviosRaw),
    }
    // #631: de dónde viene lo cobrado (origen × medio) y a quién se fió; no cambia ninguna cifra, solo la explica.
    const desgloseCobros = desglosarCobros(
      pagosCapturadosHoy.map((pg) => ({ metodo: pg.metodo, monto: pg.monto, pedidoFecha: pg.pedido.fecha })),
      startOfDay, endOfDay, abonos, cobroVentasHoy + cobroCartera,
    )
    const fiadosDelDia = listarFiadosDelDia(pedidos)

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

    // Transformar ProduccionItem a campos planos para el response (backward compat).
    // #645: con varias producciones el día es uno solo: stock inicial = el de la primera, producido y pérdidas = suma,
    // conteo final = el de la última registrada (es el conteo del día).
    const sumaItems = (producto: string, campo: 'producido' | 'rotas' | 'filtradas' | 'consumoInterno' | 'comSellador') =>
      produccion.reduce((t, p) => t + p.items.filter(i => i.producto === producto).reduce((s2, i) => s2 + Number(i[campo] ?? 0), 0), 0)
    const primera = produccion[0]
    const ultima = produccion[produccion.length - 1]
    const itemDe = (p: typeof primera | undefined, producto: string) => p?.items.find(i => i.producto === producto)
    const produccionFlat = primera
      ? {
          ...primera,
          items: undefined,
          trabajador: undefined,
          stockIniAgua: itemDe(primera, 'PACA_AGUA')?.stockIni ?? 0,
          stockIniHielo: itemDe(primera, 'PACA_HIELO')?.stockIni ?? 0,
          prodAgua: sumaItems('PACA_AGUA', 'producido'),
          prodHielo: sumaItems('PACA_HIELO', 'producido'),
          stockFinAgua: itemDe(ultima, 'PACA_AGUA')?.stockFinFisico ?? 0,
          stockFinHielo: itemDe(ultima, 'PACA_HIELO')?.stockFinFisico ?? 0,
          // #645: pérdidas del día (filtradas, merma = rotas, consumo interno) por producto
          filtradasAgua: sumaItems('PACA_AGUA', 'filtradas'),
          rotasAgua: sumaItems('PACA_AGUA', 'rotas'),
          consumoInternoAgua: sumaItems('PACA_AGUA', 'consumoInterno'),
          filtradasHielo: sumaItems('PACA_HIELO', 'filtradas'),
          rotasHielo: sumaItems('PACA_HIELO', 'rotas'),
          consumoInternoHielo: sumaItems('PACA_HIELO', 'consumoInterno'),
          botellonesLlenados: sumaItems('BOTELLON', 'producido'),
          // #618: inventario de botellones llenos: inicial de la primera producción, conteo final de la última
          stockIniBotellon: itemDe(primera, 'BOTELLON')?.stockIni ?? 0,
          stockFinBotellon: itemDe(ultima, 'BOTELLON')?.stockFinFisico ?? 0,
          comSelladorAgua: sumaItems('PACA_AGUA', 'comSellador'),
          comSelladorHielo: sumaItems('PACA_HIELO', 'comSellador'),
          comSelladorBotellon: sumaItems('BOTELLON', 'comSellador'),
          comSellTotal: produccion.reduce((t, p) => t + p.items.reduce((s2, i) => s2 + Number(i.comSellador || 0), 0), 0),
          // Comisiones de repartidor viven en Produccion.comRepartTotal
          // (son agregación de Pedidos entregados por ese trabajador, no por item)
          comRepartidorAgua: 0,
          comRepartidorHielo: 0,
          comRepartTotal: produccion.reduce((t, p) => t + Number(p.comRepartTotal), 0),
        }
      : null
    // #645: una fila por producción registrada, para listarlas y corregirlas desde el cierre
    const produccionesDelDia = produccion.map(p => ({
      id: p.id,
      turno: p.turno,
      trabajadorId: p.trabajadorId,
      trabajador: p.trabajador.nombre,
      prodAgua: itemDe(p, 'PACA_AGUA')?.producido ?? 0,
      prodHielo: itemDe(p, 'PACA_HIELO')?.producido ?? 0,
      botellonesLlenados: itemDe(p, 'BOTELLON')?.producido ?? 0,
    }))

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
        cobroCarteraEfectivo,
        cobroEfectivoHoy,
        cobroDigitalHoy,
        abonosIndependientes: abonos.abonosIndependientes,
        ajustesDeCobros: abonos.ajustesDeCobros,
        fiado,
        totalNotasCredito: totalNC,
        ventasDePedidosDelDia: ventas.ventasDePedidosDelDia,
        notasCreditoVentasAnteriores: ventas.notasCreditoVentasAnteriores,
        notasCreditoSinAjusteVentas: ventas.notasCreditoSinAjusteVentas,

        // ADR-PAGO-REPORTADO-CONFIRMADO-001 §6 — informativo, no altera netoCaja.
        porConfirmar,
        desgloseCobros,
        fiadosDelDia,

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
        unidadesAproximadas,
        unidadesError,
        produccion: produccionFlat,
        producciones: produccionesDelDia,
        // #545: stock inicial a mostrar cuando el día aún no tiene producción registrada
        stockInicialSugerido: await resolverStockInicial(prisma),
        // #644: sueldos fijos con fecha de pago cumplida y sin pagar
        sueldosQueTocan: await sueldosPendientesAl(prisma, fechaStr),
        comisionesAuto: {
          sellador: comisionesAuto.sellador,
          selladores: comisionesAuto.selladores,
          pagadoRepartidores: comisionesAuto.pagadoRepartidores,
          pagadoRepartidoresOtrosMedios: comisionesAuto.pagadoRepartidoresOtrosMedios,
          total: comisionesAuto.total,
          repartidores: comisionesAuto.repartidores.map((r) => ({
            trabajadorId: r.trabajadorId, nombre: r.nombre, total: r.total, pagado: r.pagado, pendiente: r.pendiente,
            entregasAgua: r.entregasAgua, entregasHielo: r.entregasHielo, entregasBotellon: r.entregasBotellon,
            comAgua: r.comAgua, comHielo: r.comHielo, comBotellon: r.comBotellon,
            tarifas: r.tarifas, porOrigen: r.porOrigen, fuentes: r.fuentes, revisiones: r.revisiones,
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
