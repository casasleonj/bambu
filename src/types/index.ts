export type Rol = 'ADMIN' | 'ASISTENTE' | 'CONTADOR' | 'REPARTIDOR' | 'SELLADOR'
export type EstadoPedido = 'PENDIENTE' | 'EN_RUTA' | 'ENTREGADO' | 'CANCELADO' | 'ANULADO'
export type TipoPedido = 'ENVIO' | 'PUNTO' | 'RECURRENTE'
export type MetodoPago = 'EFECTIVO' | 'TRANSFERENCIA' | 'NEQUI' | 'DAVIPLATA' | 'BONO'
export type EstadoEmbarque = 'ABIERTO' | 'CERRADO'
export type Turno = 'MANANA' | 'TARDE' | 'NOCHE'
export type TipoPago = 'COMISION' | 'FIJO'
export type EstadoFactura = 'EMITIDA' | 'PAGADA'
export type EstadoNomina = 'PENDIENTE' | 'PAGADA'

export interface Cliente {
  id: string
  nombre: string
  apellido?: string
  telefono: string
  nombreNegocio?: string
  tipoNegocio?: string
  barrio?: string
  direccion?: string
  frecuencia: string
  cadaNDias?: number
  precioAguaPref?: number
  habAgua: boolean
  habHielo: boolean
  habBotellon: boolean
  habBolsaAgua: boolean
  habBolsaHielo: boolean
  notas?: string
  ultEntrega?: string
  proxEntrega?: string
  activo: boolean
  _count?: { pedidos: number }
  pedidos?: Pedido[]
  facturas?: Factura[]
}

export interface Pedido {
  id: string
  numero: number
  clienteId: string
  tipo: TipoPedido
  estado: EstadoPedido
  cAguaPed: number
  cAguaEnt: number
  precioAgua: number
  cHieloPed: number
  cHieloEnt: number
  precioHielo: number
  cBotellonPed: number
  cBotellonEnt: number
  precioBotellon: number
  cBolsaAguaPed: number
  cBolsaAguaEnt: number
  precioBolsaAgua: number
  cBolsaHieloPed: number
  cBolsaHieloEnt: number
  precioBolsaHielo: number
  total: number
  totalPagado: number
  saldo: number
  fecha: string
  obs?: string
  embarqueId?: string
  esRecurrente: boolean
  cliente?: {
    id: string
    nombre: string
    apellido?: string
    telefono: string
    barrio?: string
    precioAguaPref?: number
  }
  pagos?: Pago[]
}

export interface Pago {
  id: string
  pedidoId: string
  metodo: MetodoPago
  monto: number
  createdAt: string
}

export interface Factura {
  id: string
  numero: string
  clienteId: string
  pedidoId: string
  fecha: string
  subtotal: number
  total: number
  montoPagado: number
  saldo: number
  estado: EstadoFactura
  cliente?: {
    id: string
    nombre: string
    apellido?: string
    telefono: string
  }
  abonos?: Abono[]
}

export interface Abono {
  id: string
  numero: string
  facturaId: string
  clienteId: string
  monto: number
  metodoPago: string
  fecha: string
}

export interface Embarque {
  id: string
  numero: number
  fecha: string
  horaSalida?: string
  horaLlegada?: string
  estado: EstadoEmbarque
  obs?: string
  trabajadorId: string
  trabajador: { id: string; nombre: string }
  pedidos: Pedido[]
}