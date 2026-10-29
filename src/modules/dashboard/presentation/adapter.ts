/**
 * Dashboard Data Adapter.
 *
 * Maps the new DDD DashboardData shape to the legacy flat shape
 * expected by DashboardClient. This allows incremental migration
 * without changing the client component.
 */

import type { DashboardData as DDDData } from '@/modules/dashboard/domain'
import type { DashboardData as LegacyData } from '@/app/(app)/dashboard/dashboard-client/types'
import { userCan } from '@/lib/permissions'
import type { Role } from '@/lib/constants'

export function toLegacyDashboardData(
  ddd: DDDData,
  userRole?: string | null,
): LegacyData {
  const detallePermitido = userCan(userRole as Role, 'view:pedidos')
  const cobros = ddd.cobros
  return {
    // El permiso del dashboard no concede acceso al detalle de pedidos.
    // Filtrar también el transporte SSR/API, no solo ocultar sus enlaces.
    cobros: !cobros
      ? null
      : detallePermitido
        ? cobros
        : {
            ...cobros,
            movimientos: [],
            porConciliar: cobros.porConciliar.map((p, i) => ({
              ...p,
              id: `revision-${i}`,
              referencia: 'Registro pendiente de revisión',
              pedidoId: null,
              importe: null,
            })),
          },
    consultadoAt: ddd.consultadoAt ?? null,
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
    prodPiezasHoy: ddd.produccion.piezasProducidas,
    prodPerdidasHoy: ddd.produccion.perdidasTotales,
    prodEficienciaHoy: ddd.produccion.eficiencia,
    prodPiezasAyer: ddd.kpis.prodPiezasAyer,
    prodEficienciaAyer: ddd.kpis.prodEficienciaAyer,
    prodPiezasTrend: ddd.kpis.prodPiezasTrend,
    prodEficienciaTrend: ddd.kpis.prodEficienciaTrend,

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
