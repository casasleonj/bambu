export interface Cliente {
  id: string
  clienteId: string
  nombre: string
  apellido?: string
  telefono: string
  nombreNegocio?: string
  tipoNegocio?: string
  barrio?: string
  direccion?: string
  frecuencia: string
  cadaNDias?: number
  proxEntrega?: string
  preciosEspeciales?: string
  notas?: string
  ultEntrega?: string
  activo: boolean
  saldoPendiente?: number
  _count?: { pedidos: number }
  pedidos?: Pedido[]
  facturas?: Factura[]
  frecuenciaSugerida?: { dias: number; label: string } | null
  productosSugeridos?: Array<{ codigo: string; nombre: string; frecuencia: number; cantidadPromedio: number }>
}

export interface Pedido {
  id: string
  numero: number
  total: number
  saldo: number
  totalPagado: number
  estado: string
  fecha: string
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
  pagos?: Array<{ metodo: string; monto: number }>
}

export interface Factura {
  id: string
  numero: string
  total: number
  saldo: number
  montoPagado: number
  estado: string
  fecha: string
  abonos?: Array<{ monto: number; metodoPago: string; fecha: string; pedidoId?: string }>
}

export type Canal = 'DOMICILIO' | 'PUNTO'

export const PRODUCTOS_PRECIO = [
  { codigo: 'PACA_AGUA', nombre: 'Paca Agua', emoji: '🍶', unidad: 'paca' },
  { codigo: 'PACA_HIELO', nombre: 'Paca Hielo', emoji: '🧊', unidad: 'paca' },
  { codigo: 'BOTELLON_FAB', nombre: 'Botellón Fábrica', emoji: '🏭', unidad: 'und' },
  { codigo: 'BOTELLON_DOM', nombre: 'Botellón Domicilio', emoji: '🏠', unidad: 'und' },
  { codigo: 'BOLSA_AGUA', nombre: 'Bolsa Agua', emoji: '💧', unidad: 'bolsa' },
  { codigo: 'BOLSA_HIELO', nombre: 'Bolsa Hielo', emoji: '❄️', unidad: 'bolsa' },
] as const

export const PRODUCTO_NOMBRES: Record<string, string> = {
  cPacaAguaPed: 'Paca Agua',
  cPacaHieloPed: 'Paca Hielo',
  cBotellonFabPed: 'Botellón Fábrica',
  cBotellonDomPed: 'Botellón Domicilio',
  cBolsaAguaPed: 'Bolsa Agua',
  cBolsaHieloPed: 'Bolsa Hielo',
}

export interface ClientesClientProps {
  initialClientes: Cliente[]
}

export interface FormData {
  nombre: string
  apellido: string
  telefono: string
  nombreNegocio: string
  tipoNegocio: string
  barrio: string
  direccion: string
  cadaNDias: number | ''
  proxEntrega: string
  preciosEspeciales: string
  notas: string
}
