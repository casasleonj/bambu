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
  notas?: string | null
  fuente?: string | null
  /** Deuda pendiente (pedidos entregados con saldo); viene de la lista/búsqueda de clientes. */
  saldoPendiente?: number
  bloqueado?: boolean
  contactos?: Array<{ nombre: string; telefono: string; relacion?: string | null }>
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
