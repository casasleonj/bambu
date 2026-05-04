export interface Pedido {
  id: string
  numero: number
  nombreCli: string
  telefonoCli: string
  zonaCli: string
  tipo: string
  canal: string
  estado: string
  embarqueId?: string
  cPacaAguaPed: number
  cPacaHieloPed: number
  cBotellonFabPed: number
  cBotellonDomPed: number
  cBolsaAguaPed: number
  cBolsaHieloPed: number
  cPacaAguaEnt: number
  cPacaHieloEnt: number
  cBotellonFabEnt: number
  cBotellonDomEnt: number
  cBolsaAguaEnt: number
  cBolsaHieloEnt: number
  precioPacaAgua: number
  precioPacaHielo: number
  precioBotellonFab: number
  precioBotellonDom: number
  precioBolsaAgua: number
  precioBolsaHielo: number
  totalPagado: number
  total: number
  saldo: number
  fecha: string
}

export interface Embarque {
  id: string
  numero: number
  trabajador: { nombre: string }
  estado: string
  ruta?: { nombre: string } | null
  totalPacas?: number
}

export interface Cliente {
  id: string
  nombre: string
  telefono: string
  direccion?: string
  preciosEspeciales?: string
}

export const ESTADOS = ['PENDIENTE', 'EN_RUTA', 'ENTREGADO', 'CANCELADO', 'ANULADO']
export const TIPOS = ['ENVIO', 'PUNTO']
