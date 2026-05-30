export interface Cliente {
  id: string
  nombre: string
  apellido?: string
  telefono: string
  direccion?: string
  barrio?: string
}

export interface Tier {
  cantMin: number
  cantMax: number | null
  precio: number
}
