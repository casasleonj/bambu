/**
 * GetDashboardData Use Case.
 *
 * Orchestrates repositories and domain services to produce the full dashboard data.
 * This is the single entry point for the dashboard presentation layer.
 */

import { getTodayString } from '@/lib/dates'
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
}

export async function getDashboardData(
  todayRange: { start: Date; end: Date },
  yesterdayRange: { start: Date; end: Date },
  deps: GetDashboardDeps,
): Promise<DashboardData> {
  // ── Parallel data fetch ───────────────────────────────────────────────
  const [
    pedidosHoy,
    pedidosAyer,
    baseDia,
    lastCierre,
    totalGastos,
    embarquesAbiertos,
    stockAlertas,
    fiadosTotal,
    produccionHoy,
    produccionAyer,
    stockConfigs,
    alertasRiesgo,
    casosActivos,
    clientesConFiado,
  ] = await Promise.all([
    deps.pedidos.findByDateRange(todayRange.start, todayRange.end),
    deps.pedidos.findByDateRange(yesterdayRange.start, yesterdayRange.end),
    deps.config.getBaseDia(`BASE_DIA_${getTodayString()}`),
    deps.config.getLastCierre(),
    deps.gastos.sumByDateRange(todayRange.start, todayRange.end),
    deps.embarques.countAbiertos(),
    deps.alertas.getStockAlertas(),
    deps.pedidos.sumFiadosEntregados(),
    deps.produccion.aggregateByDateRange(todayRange.start, todayRange.end),
    deps.produccion.aggregateByDateRange(yesterdayRange.start, yesterdayRange.end),
    deps.config.getStockConfigs(),
    deps.alertas.getRiskAlerts(),
    deps.alertas.getActiveCases(),
    deps.alertas.countClientesConFiado(),
  ])

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
    pedidosPendientes: validosHoy.filter(p => p.estadoEntrega === 'PENDIENTE').length,
    pedidosEntregados: validosHoy.filter(p => p.estadoEntrega === 'ENTREGADO').length,
    baseDia,
    totalGastos,
    ventasAyer,
    ventasTrend: calcularTrend(ventasHoy, ventasAyer),
    pedidosTrend: calcularTrend(validosHoy.length, validosAyer.length),
    embarquesAbiertos,
    prodPiezasHoy: produccionHoy.piezasProducidas,
    prodPiezasAyer: produccionAyer.piezasProducidas,
    prodPiezasTrend: calcularTrend(produccionHoy.piezasProducidas, produccionAyer.piezasProducidas),
    prodEficienciaHoy: produccionHoy.eficiencia,
    prodEficienciaAyer: produccionAyer.eficiencia,
    prodEficienciaTrend: calcularTrend(produccionHoy.eficiencia, produccionAyer.eficiencia),
  }

  // ── Assemble result ───────────────────────────────────────────────────
  const fechaHoy = new Date().toLocaleDateString('es-CO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return {
    kpis,
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
