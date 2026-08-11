export interface Cliente {
  id: string
  nombre: string
  apellido?: string
  telefono: string
  direccion?: string
  barrio?: string
  // Ya venía en /api/clientes?all=true (fetchClientesList) — solo faltaba
  // declararlo acá para poder mostrar el link de Maps de respaldo.
  linkUbicacion?: string | null
  limitePedidosFiados?: number | null
  negocios?: Array<{
    id: string
    nombre: string
    tipoNegocio?: string | null
    direccion?: string | null
    barrio?: string | null
    referencia?: string | null
    linkUbicacion?: string | null
  }>
}

export interface Tier {
  cantMin: number
  cantMax: number | null
  precio: number
}
