export interface Cliente {
  id: string
  nombre: string
  apellido?: string
  telefono: string
  direccion?: string
  barrio?: string
  nombreNegocio?: string
  limitePedidosFiados?: number | null
}

export interface Tier {
  cantMin: number
  cantMax: number | null
  precio: number
}
