export interface Factura {
  id: string
  numero: string
  fecha: string
  total: number
  saldo: number
  estado: string
  pedidoId: string
  subtotal?: number
  montoPagado?: number
  empresaNombre?: string
  empresaNit?: string
  empresaDireccion?: string
  empresaTelefono?: string
  empresaEmail?: string
  cliente?: {
    id: string
    nombre: string
    telefono: string
    direccion?: string
    barrio?: string
  }
  pedido?: {
    id: string
    numero: number
    items?: PedidoItem[]
    pagos?: Pago[]
  }
  abonos?: Abono[]
  notasCredito?: NotaCredito[]
  createdBy?: {
    username: string
  }
}

export interface PedidoItem {
  id: string
  producto: string
  cantPedido: number
  cantEntrega: number
  precio: number
  subtotal: number
}

export interface Pago {
  id: string
  metodo: string
  monto: number
  createdAt: string
}

export interface Abono {
  id: string
  numero: string
  monto: number
  metodoPago: string
  fecha: string
  pedidoId?: string
}

export interface NotaCredito {
  id: string
  numero: string
  monto: number
  motivo: string
  fecha: string
}

export interface EmpresaConfig {
  nombre: string
  nit: string
  direccion: string
  telefono: string
  email: string
}
