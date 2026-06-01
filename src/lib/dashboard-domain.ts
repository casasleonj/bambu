/**
 * Dashboard Domain — Backward Compatibility Re-exports.
 *
 * These re-exports allow existing code to import from @/lib/dashboard-domain
 * while the actual implementation lives in the DDD module structure.
 *
 * New code should import directly from @/modules/dashboard.
 */

export {
  pedidosValidos,
  calcularVentas,
  calcularFiados,
  calcularTrend,
  buildVentasPorPrecio,
  calcularVendidos,
  calcularStock,
  determinarStockInicial,
  calcularFranjasHorarias,
} from '@/modules/dashboard/domain'

export type {
  PedidoRaw,
  StockSnapshot,
  FranjaHoraria,
  VentaPorPrecio,
  InsumoAlerta,
  AlertasRiesgo,
  CasosActivos,
  ProduccionDiaria,
  DashboardKPIs,
  DashboardData,
  StockInput,
} from '@/modules/dashboard/domain'
