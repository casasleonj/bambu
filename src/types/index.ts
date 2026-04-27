export type Rol = 'ADMIN' | 'ASISTENTE' | 'CONTADOR' | 'REPARTIDOR' | 'SELLADOR'
export type EstadoPedido = 'PENDIENTE' | 'EN_RUTA' | 'ENTREGADO' | 'CANCELADO' | 'ANULADO'
export type TipoPedido = 'ENVIO' | 'MOSTRADOR' | 'RECURRENTE'
export type MetodoPago = 'EFECTIVO' | 'NEQUI' | 'DAVIPLATA' | 'TRANSFERENCIA'
export type EstadoEmbarque = 'ABIERTO' | 'CERRADO'
export type Turno = 'MANANA' | 'TARDE'
export type TipoPago = 'COMISION' | 'FIJO'

export interface ClienteStats {
  totalPedidos: number
  totalComprado: number
  frecuenciaPromedio: number
  productoFavorito: string
  diasProximaEntrega: number
}

export interface Cliente {
  id: string
  nombre: string
  telefono: string
  direccion: string
  barrio?: string
  createdAt: Date
  updatedAt: Date
}

export interface Pedido {
  id: string
  clienteId: string
  quantidade: number
  precio: number
  tipo: TipoPedido
  estado: EstadoPedido
  metodoPago: MetodoPago
  observaciones?: string
  createdAt: Date
  updatedAt: Date
}

export interface Embarque {
  id: string
  fecha: Date
  turno: Turno
  estado: EstadoEmbarque
  pedidosIds: string[]
  createdAt: Date
  updatedAt: Date
}