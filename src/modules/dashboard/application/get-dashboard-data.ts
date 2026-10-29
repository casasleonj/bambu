/**
 * GetDashboardData Use Case.
 *
 * Orchestrates repositories and domain services to produce the full dashboard data.
 * This is the single entry point for the dashboard presentation layer.
 */

import type { FinanzasRepository } from '../infrastructure/finanzas.repository'
import type { DashboardData, DashboardKPIs } from '../domain'
import {
  pedidosValidos,
  calcularVentas,
  calcularFiados,
  calcularTrend,
  buildVentasPorPrecio,
  calcularVendidos,
  calcularStock,
  calcularFranjasHorarias,
  determinarStockInicial,
} from '../domain'
import type {
  PedidoRepository,
  ProduccionRepository,
  ConfigRepository,
  AlertasRepository,
  GastosRepository,
  EmbarquesRepository,
} from '../infrastructure'

export interface GetDashboardDeps {
  pedidos: PedidoRepository
  produccion: ProduccionRepository
  config: ConfigRepository
  alertas: AlertasRepository
  gastos: GastosRepository
  embarques: EmbarquesRepository
  finanzas?: FinanzasRepository
}

export async function getDashboardData(
  todayRange: { start: Date; end: Date },
  yesterdayRange: { start: Date; end: Date },
  deps: GetDashboardDeps,
): Promise<DashboardData> {
  // La composición productiva siempre provee finanzas. El fallback conserva
  // el contrato de los repositorios inyectados anteriores, sin inventar cobros.
  const financiero =
    deps.finanzas?.leer(todayRange, yesterdayRange) ??
    (async () => {
      const [
        pedidosHoy,
        pedidosAyer,
        baseDia,
        totalGastos,
        fiadosTotal,
        clientesConFiado,
      ] = await Promise.all([
        deps.pedidos.findByDateRange(todayRange.start, todayRange.end),
        deps.pedidos.findByDateRange(yesterdayRange.start, yesterdayRange.end),
        deps.config.getBaseDia(
          `BASE_DIA_${todayRange.start.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })}`,
        ),
        deps.gastos.sumByDateRange(todayRange.start, todayRange.end),
        deps.pedidos.sumFiadosEntregados(),
        deps.alertas.countClientesConFiado(),
      ])
      return {
        pedidosHoy,
        pedidosAyer,
        baseDia,
        totalGastos,
        fiadosTotal,
        clientesConFiado,
        cobros: null,
        consultadoAt: null,
      }
    })()
  const [
    finanzas,
    lastCierre,
    embarquesAbiertos,
    stockAlertas,
    produccionHoy,
    produccionAyer,
    stockConfigs,
    alertasRiesgo,
    casosActivos,
  ] = await Promise.all([
    financiero,
    deps.config.getLastCierre(),
    deps.embarques.countAbiertos(),
    deps.alertas.getStockAlertas(),
    deps.produccion.aggregateByDateRange(todayRange.start, todayRange.end),
    deps.produccion.aggregateByDateRange(
      yesterdayRange.start,
      yesterdayRange.end,
    ),
    deps.config.getStockConfigs(),
    deps.alertas.getRiskAlerts(),
    deps.alertas.getActiveCases(),
  ])
  const {
    pedidosHoy,
    pedidosAyer,
    baseDia,
    totalGastos,
    fiadosTotal,
    clientesConFiado,
  } = finanzas

  // ── Domain calculations ───────────────────────────────────────────────
  const validosHoy = pedidosValidos(pedidosHoy)
  const validosAyer = pedidosValidos(pedidosAyer)

  const ventasHoy = calcularVentas(validosHoy)
  const ventasAyer = calcularVentas(validosAyer)
  const fiadosHoy = calcularFiados(pedidosHoy)

  const vendidos = calcularVendidos(pedidosHoy)

  const { franjas, maxFranja } = calcularFranjasHorarias(validosHoy)
  const ventasPorPrecio = buildVentasPorPrecio(validosHoy)

  const tieneCierrePrevio = lastCierre !== null
  const stockInicial = determinarStockInicial(
    lastCierre?.stockFinAgua ?? null,
    lastCierre?.stockFinHielo ?? null,
    tieneCierrePrevio,
    stockConfigs,
  )

  const stock = calcularStock({
    stockIniAgua: stockInicial.stockIniAgua,
    stockIniHielo: stockInicial.stockIniHielo,
    produccion: produccionHoy,
    aguaVendida: vendidos.agua,
    hieloVendido: vendidos.hielo,
  })

  // ── KPIs ──────────────────────────────────────────────────────────────
  const kpis: DashboardKPIs = {
    pedidosHoy: validosHoy.length,
    ventasHoy,
    fiadosHoy,
    fiadosTotal,
    clientesConFiado,
    pedidosPendientes: validosHoy.filter((p) => p.estadoEntrega === 'PENDIENTE')
      .length,
    pedidosEntregados: validosHoy.filter((p) => p.estadoEntrega === 'ENTREGADO')
      .length,
    baseDia,
    totalGastos,
    ventasAyer,
    ventasTrend: calcularTrend(ventasHoy, ventasAyer),
    pedidosTrend: calcularTrend(validosHoy.length, validosAyer.length),
    embarquesAbiertos,
    prodPiezasHoy: produccionHoy.piezasProducidas,
    prodPiezasAyer: produccionAyer.piezasProducidas,
    prodPiezasTrend: calcularTrend(
      produccionHoy.piezasProducidas,
      produccionAyer.piezasProducidas,
    ),
    prodEficienciaHoy: produccionHoy.eficiencia,
    prodEficienciaAyer: produccionAyer.eficiencia,
    prodEficienciaTrend: calcularTrend(
      produccionHoy.eficiencia,
      produccionAyer.eficiencia,
    ),
  }

  // ── Assemble result ───────────────────────────────────────────────────
  const fechaHoy = todayRange.start.toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return {
    kpis,
    cobros: finanzas.cobros,
    consultadoAt: finanzas.consultadoAt,
    stock,
    produccion: produccionHoy,
    vendidos,
    ventasPorPrecio,
    franjasHorarias: franjas,
    maxFranja,
    stockAlertas,
    alertasRiesgo,
    casosActivos,
    fechaHoy,
  }
}
