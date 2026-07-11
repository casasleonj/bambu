export interface Ruta {
  id: string
  nombre: string
  repartidorId?: string | null
}

export interface Trabajador {
  id: string
  nombre: string
  capacidadKg?: number
  comPacaAgua?: number
  comPacaHielo?: number
  comBotellon?: number
  comRepartAgua?: number
  comRepartHielo?: number
  comRepartBotellon?: number
}

export interface EmbarqueProducto {
  producto: string
  cargadas: number
  devueltas: number
  cambios: number
  rotas: number
}

export interface Pedido {
  id: string
  numero: number
  estado: string
  estadoEntrega?: string
  origen?: string
  clienteId?: string
  negocioId?: string | null
  nombreCli?: string
  apellidoCli?: string | null
  nombreNegocioCli?: string | null
  cliente?: { id?: string; nombre: string; apellido?: string | null; barrio: string | null }
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
  numeroDia: number
  fecha: string
  horaSalida: string | null
  horaLlegada: string | null
  estado: string
  tipoMoto: string | null
  baseDinero: number
  obs: string | null
  trabajador: Trabajador
  ruta?: Ruta | null
  pedidos: Pedido[]
  productos: EmbarqueProducto[]
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
  stockSnapshot?: unknown
}

export interface EmbarqueEditable {
  id: string
  trabajador: Trabajador
  ruta?: Ruta | null
  horaSalida: string | null
  tipoMoto: string | null
  baseDinero: number
  obs: string | null
  productos: EmbarqueProducto[]
}
