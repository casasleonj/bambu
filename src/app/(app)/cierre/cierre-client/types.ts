export interface VentaPorOrigen {
  origen: string
  total: number
  count: number
}

export interface FacturaResumen {
  numero: string
  cliente?: string
  total: number
  saldo: number
  estado: string
}

export interface GastoCategoria {
  categoria: string
  total: number
  cantidad: number
}

export interface EmbarqueResumen {
  numero: number
  repartidor?: string
  ruta?: string
  pacasAgua: number
  pacasHielo: number
  devueltasAgua: number
  devueltasHielo: number
  rotasAgua: number
  rotasHielo: number
  estado: string
}

export interface ArqueoDenominacion {
  valor: number
  cantidad: number
  subtotal: number
}

export interface CierreData {
  // Financiero
  numPedidos: number
  totalVentas: number
  cobrado: number
  cobroVentasHoy: number
  cobroCartera: number
  fiado: number
  totalNotasCredito: number

  // Métodos
  efectivo: number
  transferencia: number
  nequi: number
  daviplata: number
  bono: number

  // Origen
  ventasPorOrigen: VentaPorOrigen[]

  // Facturas
  facturasEmitidas: number
  facturasPagadasCount: number
  facturasPagadasTotal: number
  facturasPorCobrarCount: number
  facturasPorCobrarTotal: number
  facturasParcialCount: number
  facturasParcialTotal: number
  facturasAnuladasCount: number
  facturas: FacturaResumen[]

  // Gastos
  totalGastos: number
  gastosPorCategoria: GastoCategoria[]

  // Embarques
  embarques: EmbarqueResumen[]

  // Pedidos perdidos
  pedidosCanceladosCount: number
  pedidosCanceladosTotal: number
  pedidosNoEntregadosCount: number
  pedidosNoEntregadosTotal: number
  pedidosAnuladosCount: number
  pedidosAnuladosTotal: number

  // Clientes
  clientesNuevos: number

  // Descuentos
  descuentosRepartidorTotal: number
  descuentosRepartidorCount: number
  descuentos: { monto: number; motivo: string; repartidor?: string }[]

  // Stock
  aguaVendida: number
  hieloVendido: number
  botellonVendido: number
  bolsaAguaVendida: number
  bolsaHieloVendida: number
  produccion: {
    stockIniAgua: number
    stockIniHielo: number
    prodAgua: number
    prodHielo: number
    stockFinAgua: number
    stockFinHielo: number
    comSelladorAgua: number
    comSelladorHielo: number
    comSellTotal: number
    comRepartidorAgua: number
    comRepartidorHielo: number
    comRepartTotal: number
  } | null

  // Cierre
  netoCaja: number

  // Fecha
  fecha: string

  // Arqueo (si el día ya fue cerrado)
  arqueo?: Record<string, number> | null
  totalContado?: number | null
  diferenciaArqueo?: number | null

  // Cierre metadata
  horaCierre?: string | null

  // Post-cierre transactions
  postCierre?: {
    pedidos: {
      id: string
      numero: number
      cliente?: string
      total: number
      totalPagado: number
      saldo: number
      estadoEntrega: string
      origen: string
      pagos: { metodo: string; monto: number }[]
    }[]
    embarques: {
      numero: number
      repartidor?: string
      ruta?: string
      pacasAgua: number
      pacasHielo: number
      estado: string
    }[]
    gastos: {
      categoria: string
      descripcion: string
      monto: number
    }[]
  } | null
}
