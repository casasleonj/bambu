export interface VentaPorPrecio {
  producto: string
  precio: number
  cantidad: number
  subtotal: number
}

export interface FranjaHoraria {
  label: string
  range: [number, number]
  count: number
}

export interface DashboardData {
  pedidosHoy: number
  ventas: number
  fiadosHoy: number
  fiadosTotal: number
  clientesConFiado: number | bigint
  pedidosPendientes: number
  pedidosEntregados: number
  baseDia: number
  totalGastos: number
  ventasAyer: number
  ventasTrend: number
  pedidosTrend: number
  franjas: FranjaHoraria[]
  maxFranja: number
  ventasPorPrecio: VentaPorPrecio[]
  aguaVendida: number
  hieloVendido: number
  botellonVendido: number
  prodAguaHoy: number
  prodHieloHoy: number
  stockAgua: number
  stockHielo: number
  // stockBotellon eliminado — botellones son passthrough (sin ciclo de stock).
  embarquesAbiertos: number
  stockAlertas: Array<{ id: string; nombre: string; stock: unknown; unidad: string }>
  fechaHoy: string
  alertasRiesgo: {
    disputasAbiertas: number
    clientesBloqueados: number
    clientesConflictivos: number
    promesasProximasVencer: number
    clientesNoVerificados: number
  }
  casosActivos: {
    total: number
    criticos: number
    sinResolver48h: number
  }
}
