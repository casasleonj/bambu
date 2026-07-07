/**
 * Dashboard Domain Types.
 *
 * These types define the contract between domain, application, and presentation layers.
 * They are independent of Prisma and any ORM.
 */

import type { ProductCode } from '@/shared/domain'

// ── Raw Pedido (from Prisma) ────────────────────────────────────────────

export interface PedidoRaw {
  id: string
  numero: number
  fecha: Date | string
  total: number | string | { toNumber?: () => number; toString: () => string }
  saldo: number | string | { toNumber?: () => number; toString: () => string }
  estadoEntrega: string
  estadoPago: string
  cPacaAguaEnt: number | null
  cPacaHieloEnt: number | null
  cBotellonFabEnt: number | null
  cBotellonDomEnt: number | null
  items?: Array<{
    producto: string
    cantEntrega: number
    precio: number | string | { toNumber?: () => number; toString: () => string }
  }>
}

// ── Domain Entities ─────────────────────────────────────────────────────

export interface StockSnapshot {
  agua: number
  hielo: number
  // Botellones NO se trackean: son passthrough. No hay ciclo de stock.
  // Se cuentan como ventas (VendidosHoy.botellon) pero no como inventario.
}

export interface FranjaHoraria {
  label: string
  range: [number, number]
  count: number
}

export interface VentaPorPrecio {
  producto: ProductCode
  precio: number
  cantidad: number
  subtotal: number
}

export interface InsumoAlerta {
  id: string
  nombre: string
  stock: number
  unidad: string
}

export interface AlertasRiesgo {
  disputasAbiertas: number
  clientesBloqueados: number
  clientesConflictivos: number
  promesasProximasVencer: number
  clientesNoVerificados: number
}

export interface CasosActivos {
  total: number
  criticos: number
  sinResolver48h: number
}

export interface ProduccionDiaria {
  aguaProducida: number
  hieloProducido: number
  perdidasAgua: number
  perdidasHielo: number
  piezasProducidas: number
  perdidasTotales: number
  eficiencia: number
}

export interface VendidosHoy {
  agua: number
  hielo: number
  botellon: number
}

// ── Computed KPIs ───────────────────────────────────────────────────────

export interface DashboardKPIs {
  pedidosHoy: number
  ventasHoy: number
  fiadosHoy: number
  fiadosTotal: number
  clientesConFiado: number
  pedidosPendientes: number
  pedidosEntregados: number
  baseDia: number
  totalGastos: number
  ventasAyer: number
  ventasTrend: number
  pedidosTrend: number
  embarquesAbiertos: number
  prodPiezasHoy: number
  prodPiezasAyer: number
  prodPiezasTrend: number
  prodEficienciaHoy: number
  prodEficienciaAyer: number
  prodEficienciaTrend: number
}

// ── Full Dashboard Data (aggregation of all domain data) ────────────────

export interface DashboardData {
  kpis: DashboardKPIs
  stock: StockSnapshot
  produccion: ProduccionDiaria
  vendidos: VendidosHoy
  ventasPorPrecio: VentaPorPrecio[]
  franjasHorarias: FranjaHoraria[]
  maxFranja: number
  stockAlertas: InsumoAlerta[]
  alertasRiesgo: AlertasRiesgo
  casosActivos: CasosActivos
  fechaHoy: string
}
