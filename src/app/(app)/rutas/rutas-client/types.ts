export interface Ruta {
  id: string
  nombre: string
  dias?: string
  activo: boolean
  repartidor?: { id: string; nombre: string }
  repartidorRespaldo?: { id: string; nombre: string }
  horarioInicio?: string
  horarioFin?: string
  _count?: { clientes: number; embarques: number }
}
