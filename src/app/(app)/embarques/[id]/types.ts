export interface PedidoResumen {
  id: string
  numero: number
  estado: string
  estadoEntrega: string
  estadoPago: string
  origen: string
  total: number
  totalPagado: number
  saldo: number
  cPacaAguaPed: number
  cPacaHieloPed: number
  cBotellonFabPed: number
  cBotellonDomPed: number
  cBolsaAguaPed: number
  cBolsaHieloPed: number
  cPacaAguaEnt?: number | null
  cPacaHieloEnt?: number | null
  cBotellonFabEnt?: number | null
  cBotellonDomEnt?: number | null
  cBolsaAguaEnt?: number | null
  cBolsaHieloEnt?: number | null
  clienteId?: string
  negocioId?: string | null
  nombreCli?: string
  apellidoCli?: string | null
  nombreNegocioCli?: string | null
  cliente?: { id: string; nombre: string; apellido?: string | null; barrio: string | null; telefono: string | null } | null
}

export interface EmbarqueDetalle {
  id: string
  numero: number
  numeroDia: number
  fecha: string
  horaSalida: string | null
  horaLlegada: string | null
  estado: string
  tipoMoto: string | null
  baseDinero: number
  dineroEntregado: number
  obs: string | null
  trabajador: {
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
  ruta?: { id: string; nombre: string } | null
  pedidos: PedidoResumen[]
  productos: Array<{ producto: string; cargadas: number; devueltas?: number; cambios?: number; rotas?: number }>
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
