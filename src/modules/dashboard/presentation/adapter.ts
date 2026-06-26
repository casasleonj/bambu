/**
 * Dashboard Data Adapter.
 *
 * Maps the new DDD DashboardData shape to the legacy flat shape
 * expected by DashboardClient. This allows incremental migration
 * without changing the client component.
 */

import type { DashboardData as DDDData } from '@/modules/dashboard/domain'
import type { DashboardData as LegacyData } from '@/app/(app)/dashboard/dashboard-client/types'

export function toLegacyDashboardData(ddd: DDDData): LegacyData {
  return {
    // KPIs
    pedidosHoy: ddd.kpis.pedidosHoy,
    ventas: ddd.kpis.ventasHoy,
    fiadosHoy: ddd.kpis.fiadosHoy,
    fiadosTotal: ddd.kpis.fiadosTotal,
    clientesConFiado: ddd.kpis.clientesConFiado,
    pedidosPendientes: ddd.kpis.pedidosPendientes,
    pedidosEntregados: ddd.kpis.pedidosEntregados,
    baseDia: ddd.kpis.baseDia,
    totalGastos: ddd.kpis.totalGastos,
    ventasAyer: ddd.kpis.ventasAyer,
    ventasTrend: ddd.kpis.ventasTrend,
    pedidosTrend: ddd.kpis.pedidosTrend,
    embarquesAbiertos: ddd.kpis.embarquesAbiertos,

    // Time bands
    franjas: ddd.franjasHorarias,
    maxFranja: ddd.maxFranja,

    // Sales by price
    ventasPorPrecio: ddd.ventasPorPrecio,

    // Product quantities sold (de pedidos ENTREGADOS, no de producción)
    aguaVendida: ddd.vendidos.agua,
    hieloVendido: ddd.vendidos.hielo,
    botellonVendido: ddd.vendidos.botellon,

    // Production
    prodAguaHoy: ddd.produccion.aguaProducida,
    prodHieloHoy: ddd.produccion.hieloProducido,

    // Stock
    stockAgua: ddd.stock.agua,
    stockHielo: ddd.stock.hielo,
    // stockBotellon eliminado — botellones son passthrough.

    // Alerts
    stockAlertas: ddd.stockAlertas,
    fechaHoy: ddd.fechaHoy,
    alertasRiesgo: ddd.alertasRiesgo,
    casosActivos: ddd.casosActivos,
  }
}
