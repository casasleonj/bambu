export interface Cliente {
  id: string
  nombre: string
  telefono: string
  direccion?: string
  preciosEspeciales?: string
}

export interface Tier {
  cantMin: number
  cantMax: number | null
  precio: number
}

export interface PagoPedido {
  metodo: string
  monto: number
}

export interface PedidoItemInput {
  producto: 'PACA_AGUA' | 'PACA_HIELO' | 'BOTELLON' | 'BOLSA_AGUA' | 'BOLSA_HIELO'
  cantidad: number
  precioManual?: number
}

export interface PedidoFormData {
  clienteId: string
  clienteNuevo?: { nombre: string; telefono: string; direccion: string; barrio?: string }
  canal: string
  items: PedidoItemInput[]
  preciosManuales: Record<string, number>
  pagos: PagoPedido[]
  obs: string
  total: number
}

export interface PedidoFormProps {
  onSubmit?: (pedido: PedidoFormData) => void
  clientes?: Cliente[]
  precios?: Record<string, number>
}
