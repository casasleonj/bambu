export interface Cliente {
  id: string
  nombre: string
  apellido?: string
  telefono: string
  direccion?: string
  barrio?: string
  limitePedidosFiados?: number | null
  negocios?: Array<{
    id: string
    nombre: string
    tipoNegocio?: string | null
    direccion?: string | null
    barrio?: string | null
    referencia?: string | null
  }>
}

export interface Tier {
  cantMin: number
  cantMax: number | null
  precio: number
}
