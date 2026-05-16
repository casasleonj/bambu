export interface Cliente {
  id: string
  nombre: string
  telefono: string
  direccion?: string
  barrio?: string
  plantillaRecurrente?: {
    activo: boolean
    cadaNDias: number
  } | null
}

export type CanalRecurrente = 'DOMICILIO' | 'PUNTO'
export type TipoRecurrente = 'ENVIO' | 'PUNTO'

export interface NuevoRecurrenteForm {
  clienteId: string
  cadaNDias: number
  canal: CanalRecurrente
  tipo: TipoRecurrente
  horaPreferida: string
  proxGeneracion: string
  pacaAgua: number
  pacaHielo: number
  botellon: number
  bolsaAgua: number
  bolsaHielo: number
  notas: string
}
