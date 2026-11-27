/**
 * Dashboard Domain Types.
 *
 * These types define the contract between domain, application, and presentation layers.
 * They are independent of Prisma and any ORM.
 */

import type { CobrosPeriodo } from '@/lib/cobros-periodo'
import type { ProductCode } from '@/shared/domain'

// ── Raw Pedido (from Prisma) ────────────────────────────────────────────

export interface PedidoRaw {
  exigible?: number
  id: string
  numero: number
  fecha: Date | string
  total: number | string | { toNumber?: () => number; toString: () => string }
  saldo: number | string | { toNumber?: () => number; toString: () => string }
  estadoEntrega: string
  estadoPago: string
  canal?: string | null
  cPacaAguaEnt: number | null
  cPacaHieloEnt: number | null
  cBotellonFabEnt: number | null
  cBotellonDomEnt: number | null
  items?: Array<{
    producto: string
    cantEntrega: number
    cantRegaloEntrega?: number
    precio:
      | number
      | string
      | { toNumber?: () => number; toString: () => string }
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
  canal: 'PUNTO' | 'DOMICILIO'
  precio: number
  cantidad: number
  cantidadRegalo?: number
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
  pedidosAtrasadosSinAsignar: number
  /** Pedidos de HOY, pendientes y sin embarque, cuya ruta ya tuvo 3+
   *  embarques cerrados hoy sin haberlos asignado nunca — ver
   *  findPedidosHoyEnRiesgoIds en src/lib/pedidos-sin-asignar.ts. */
  pedidosHoyEnRiesgo: number
}

export interface CasosActivos {
  total: number
  criticos: number
  sinResolver48h: number
}

/**
 * #922 — Alcance de cada familia de métricas frente al filtro global de fecha.
 *
 * `PERIODO`: la cifra corresponde al rango seleccionado.
 * `ACTUAL`: la cifra es el estado de hoy y NO se vuelve histórica al cambiar
 *           el rango; se rotula para que no se confunda con un corte pasado.
 * `NO_DISPONIBLE`: no hay evidencia conciliada para el rango; se muestra
 *           "por conciliar" en lugar de inventar un saldo.
 */
export type AlcanceMetrica = 'PERIODO' | 'ACTUAL' | 'NO_DISPONIBLE'

export interface AlcanceDashboard {
  /** true cuando el rango seleccionado es exactamente el día de hoy (Bogotá). */
  esPeriodoActual: boolean
  stock: AlcanceMetrica
  /** fiadosTotal / clientesConFiado: saldo de cartera a fecha de consulta. */
  saldos: AlcanceMetrica
  /** alertasRiesgo / casosActivos / stockAlertas. */
  alertas: AlcanceMetrica
  embarques: AlcanceMetrica
  /**
   * Motivo legible cuando alguna métrica queda fuera del rango.
   * `null` si todo el tablero responde al período.
   */
  motivo: string | null
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
  cobros?: CobrosPeriodo | null
  consultadoAt?: string | null
  kpis: DashboardKPIs
  stock: StockSnapshot
  produccion: ProduccionDiaria
  vendidos: VendidosHoy
  ventasPorPrecio: VentaPorPrecio[]
  ventasAdvertencia?: { sinPrecio: number; aproximados: number; ayerSinPrecio: number; ayerAproximados: number }
  franjasHorarias: FranjaHoraria[]
  maxFranja: number
  stockAlertas: InsumoAlerta[]
  alertasRiesgo: AlertasRiesgo
  casosActivos: CasosActivos
  /** #922 — qué parte del tablero responde al rango y qué es estado actual. */
  alcance: AlcanceDashboard
  fechaHoy: string
}
