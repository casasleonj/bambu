import type { DesgloseCobros, FiadoDelDia, GastoDelDia, PagoPorConfirmarDetalle } from '@/lib/cierre-desglose-cobros'
import type { AbonoDelDia, CorreccionDelDia } from '@/lib/cobro-cartera'
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
  /** #601: parte de `cobroCartera` recibida en efectivo (abonos independientes menos ajustes). */
  cobroCarteraEfectivo?: number
  /** #601: efectivo que entró en la caja hoy (pagos + abonos en efectivo). */
  cobroEfectivoHoy?: number
  /** #601: dinero que llegó por Nequi, transferencia, Daviplata o bono (no está en la caja). */
  cobroDigitalHoy?: number
  /** #601: guardado al cerrar (cierres nuevos). Los cierres anteriores no lo tienen. */
  efectivoEsperado?: number
  abonosIndependientes?: number
  ajustesDeCobros?: number
  fiado: number
  totalNotasCredito: number
  ventasDePedidosDelDia?: number
  /** #656: original comercial antes de distinguir entrega; los cierres anteriores no lo traen. */
  valorComercialPedidosDelDia?: number
  parcialesPorConciliar?: { pedidoId: string; numero: number }[]
  notasCreditoVentasAnteriores?: number
  notasCreditoSinAjusteVentas?: number
  // ADR-PAGO-REPORTADO-CONFIRMADO-001 §6 — informativo, no altera netoCaja.
  porConfirmar?: {
    total: number
    count: number
    porMetodo: Partial<Record<'EFECTIVO' | 'TRANSFERENCIA' | 'NEQUI' | 'DAVIPLATA' | 'BONO', number>>
    diasPreviosCount: number
    diasPreviosTotal: number
    /** #631: detalle de los pagos por confirmar (cierres anteriores a este cambio no lo traen). */
    detalleHoy?: PagoPorConfirmarDetalle[]
    detalleDiasPrevios?: PagoPorConfirmarDetalle[]
  }
  /** #631: de dónde viene lo cobrado y a quién se fió (cierres anteriores no lo traen). */
  desgloseCobros?: DesgloseCobros
  fiadosDelDia?: FiadoDelDia[]
  /** #646: cada gasto del día (descripción, categoría, hora, quién registró, importe). */
  gastosDelDia?: GastoDelDia[]
  /** #646: cuáles son los abonos (suman) y las correcciones (restan) de cobros del día. */
  abonosDelDia?: { abonos: AbonoDelDia[]; correcciones: CorreccionDelDia[] }
  /** #631: ¿quien consulta puede confirmar pagos digitales? Si no, quién los confirma. */
  confirmaPagos?: { puede: boolean; nombre: string | null }

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
  /** #650 (2b): pedidos cuyas unidades no se pudieron repartir por día (se cuentan en el día de creación). */
  unidadesAproximadas?: { pedidoId: string; numero: number | null; fechaCreacion: string; unidades: { agua: number; hielo: number; botellon: number; bolsaAgua: number; bolsaHielo: number } }[]
  /** true si falló el reparto por día y se muestran las cifras por fecha de creación. */
  unidadesError?: boolean
  produccion: {
    stockIniAgua: number
    stockIniHielo: number
    prodAgua: number
    prodHielo: number
    stockFinAgua: number
    stockFinHielo: number
    comSelladorAgua: number
    comSelladorHielo: number
    comSelladorBotellon?: number
    comSellTotal: number
    /** #645: pérdidas del día (filtradas, merma = rotas, consumo interno) y botellones llenados */
    filtradasAgua?: number
    rotasAgua?: number
    consumoInternoAgua?: number
    filtradasHielo?: number
    rotasHielo?: number
    consumoInternoHielo?: number
    botellonesLlenados?: number
    /** #618: inventario de botellones llenos */
    stockIniBotellon?: number
    stockFinBotellon?: number
    comRepartidorAgua: number
    comRepartidorHielo: number
    comRepartTotal: number
  } | null
  /** #645: una fila por producción registrada ese día */
  producciones?: { id: string; turno: string; trabajadorId: string; trabajador: string; prodAgua: number; prodHielo: number; botellonesLlenados: number }[]
  /** #545: stock inicial (último cierre o Config) para días sin producción registrada */
  stockInicialSugerido?: { stockIniAgua: number; stockIniHielo: number; stockIniBotellon?: number }

  // #499: comisiones del día calculadas por el servidor (repartidores con lo pagado y lo pendiente + sellador)
  comisionesAuto?: {
    sellador: number
    /** #645: comisión de cada sellador del día con lo pagado y lo pendiente */
    selladores?: { trabajadorId: string; nombre: string; total: number; pagado: number; pendiente: number; detalle: { producto: string; unidades: number; comision: number }[] }[]
    pagadoRepartidores: number
    total: number
    repartidores: ({ trabajadorId: string; nombre: string; total: number; pagado: number; pendiente: number } & Partial<import('@/lib/comision-repartidor-calculo').ComisionRepartidor>)[]
  }

  // #644: sueldos fijos con fecha de pago cumplida y sin pagar
  sueldosQueTocan?: { trabajadorId: string; nombre: string; rol: string; fecha: string; monto: number; fueraDeCaja: boolean }[]

  // Cierre
  netoCaja: number
  baseDia?: number
  comisiones?: number
  salarios?: number

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
