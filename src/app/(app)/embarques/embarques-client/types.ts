export interface Ruta {
  id: string
  nombre: string
  repartidorId?: string | null
}

export interface Trabajador {
  id: string
  nombre: string
}

export interface Pedido {
  id: string
  numero: number
  cliente?: { nombre: string; barrio: string | null }
  cPacaAguaPed: number
  cPacaHieloPed: number
  cBotellonFabPed: number
  cBotellonDomPed: number
  cBolsaAguaPed: number
  cBolsaHieloPed: number
}

export interface Embarque {
  id: string
  numero: number
  fecha: string
  horaSalida: string | null
  estado: string
  obs: string | null
  trabajador: {
    id: string
    nombre: string
  }
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
