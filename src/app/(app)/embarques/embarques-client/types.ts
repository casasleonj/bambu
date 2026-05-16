export interface Ruta {
  id: string
  nombre: string
  repartidorId?: string | null
}

export interface Trabajador {
  id: string
  nombre: string
  comPacaAgua?: number
  comPacaHielo?: number
  comBotellon?: number
  comRepartAgua?: number
  comRepartHielo?: number
  comRepartBotellon?: number
}

export interface Pedido {
  id: string
  numero: number
  estado: string
  estadoEntrega?: string
  origen?: string
  cliente?: { nombre: string; barrio: string | null }
  cPacaAguaPed: number
  cPacaHieloPed: number
  cBotellonFabPed: number
  cBotellonDomPed: number
  cBolsaAguaPed: number
  cBolsaHieloPed: number
  cPacaAguaEnt?: number
  cPacaHieloEnt?: number
  cBotellonFabEnt?: number
  cBotellonDomEnt?: number
  cBolsaAguaEnt?: number
  cBolsaHieloEnt?: number
}

export interface Embarque {
  id: string
  numero: number
  fecha: string
  horaSalida: string | null
  estado: string
  obs: string | null
  trabajador: Trabajador
  ruta?: Ruta | null
  pedidos: Pedido[]
  totalPacas?: number
  pesoKg?: number
  capacidadKg?: number
  capacidadInfo?: {
    nivel: string
    label: string
    color: string
    icon: string
    porcentaje: number
    total: number
    pesoKg: number
    capacidadKg: number
  }
}
