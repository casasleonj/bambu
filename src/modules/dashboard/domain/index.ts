// Domain Types
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
} from './types'

// Domain Services
export { calcularStock, determinarStockInicial } from './stock.service'
export type { StockInput } from './stock.service'

export {
  pedidosValidos,
  calcularVentas,
  calcularFiados,
  calcularTrend,
  buildVentasPorPrecio,
  calcularVendidos,
} from './ventas.service'

export { calcularFranjasHorarias } from './franjas.service'
