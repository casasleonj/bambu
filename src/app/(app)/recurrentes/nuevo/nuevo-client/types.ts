export interface Cliente {
  id: string
  nombre: string
  telefono: string
  direccion?: string | null
  barrio?: string | null
  linkUbicacion?: string | null
  plantillaRecurrente?: {
    activo: boolean
    cadaNDias: number
  } | null
}

export type CanalRecurrente = 'DOMICILIO' | 'PUNTO'

export interface NuevoRecurrenteForm {
  clienteId: string
  cadaNDias: number
  canal: CanalRecurrente
  horaPreferida: string
  proxGeneracion: string
  pacaAgua: number
  pacaHielo: number
  botellon: number
  bolsaAgua: number
  bolsaHielo: number
  notas: string
}
