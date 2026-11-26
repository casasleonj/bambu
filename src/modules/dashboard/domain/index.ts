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
  AlcanceMetrica,
  AlcanceDashboard,
} from './types'

// Domain Services
export { calcularStock, determinarStockInicial } from './stock.service'
export type { StockInput } from './stock.service'
export { calcularAlcance } from './alcance.service'

export {
  pedidosValidos,
  calcularVentas,
  calcularFiados,
  calcularTrend,
  buildVentasPorPrecio,
  calcularVendidos,
} from './ventas.service'

export { calcularFranjasHorarias } from './franjas.service'
