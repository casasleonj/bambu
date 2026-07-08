export { METODOS_PAGO_IDS as METODOS_PAGO } from '@/lib/metodos-pago'

export interface Cliente {
  id: string
  nombre: string
  apellido?: string | null
  telefono: string
}

export interface Pedido {
  id: string
  numero: number
  clienteId: string
  negocioId?: string | null
  nombreCli: string
  apellidoCli?: string | null
  nombreNegocioCli?: string | null
  cliente: Cliente
  tipo: string
  cPacaAguaPed: number
  cPacaHieloPed: number
  cBotellonFabPed: number
  cBotellonDomPed: number
  cBolsaAguaPed: number
  cBolsaHieloPed: number
  precioPacaAgua: number
  precioPacaHielo: number
  precioBotellonFab: number
  precioBotellonDom: number
  precioBolsaAgua: number
  precioBolsaHielo: number
  total: number
  totalPagado: number
  saldo: number
}

export interface Embarque {
  id: string
  numero: number
  numeroDia: number
  trabajador: { nombre: string; comPacaAgua?: number; comPacaHielo?: number; comBotellon?: number; comRepartAgua?: number; comRepartHielo?: number; comRepartBotellon?: number }
  ruta?: { nombre: string } | null
  pedidos: Pedido[]
  productos?: Array<{ producto: string; cargadas: number; devueltas: number; cambios: number; rotas: number }>
  totalPacas?: number
  pesoKg?: number
  capacidadKg?: number
  capacidadInfo?: {
    nivel: string
    label: string
    color: string
    icon: string
    porcentaje: number
    pesoKg: number
    capacidadKg: number
    total: number
  }
  pacasAgua: number
  pacasHielo: number
  baseDinero: number
  horaSalida?: string
}

export interface ProductoRetorno {
  devueltas: number
  cambios: number
  rotas: number
}

export interface GastoItem {
  categoria: string
  monto: number
  nota: string
}

export interface EmbarqueAbierto {
  id: string
  numero: number
  trabajador: { nombre: string }
}

export interface PagoItem {
  metodo: string
  monto: number
}

export interface CuadrePedido {
  pedidoId: string
  entregado: 'COMPLETO' | 'PARCIAL' | 'NO_ENTREGADO'
  productosEntregados: {
    cPacaAguaEnt: number
    cPacaHieloEnt: number
    cBotellonFabEnt: number
    cBotellonDomEnt: number
    cBolsaAguaEnt: number
    cBolsaHieloEnt: number
  }
  preciosReales: {
    pacaAgua: number
    pacaHielo: number
    botellonFab: number
    botellonDom: number
    bolsaAgua: number
    bolsaHielo: number
  }
  pagado: 'COMPLETO' | 'PARCIAL' | 'NO_PAGADO'
  pagos: PagoItem[]
  nuevoEmbarqueId?: string
}

export interface VentaLibre {
  clienteId: string
  clienteNombre: string
  cPacaAgua: number
  cPacaHielo: number
  cBotellonFab: number
  cBotellonDom: number
  cBolsaAgua: number
  cBolsaHielo: number
  pagos: PagoItem[]
  obs: string
}

export function calcularMontoPagado(pagos: PagoItem[]): number {
  return pagos.reduce((sum, p) => sum + (p.monto || 0), 0)
}

export function calcularTotalEntregado(cuadre: CuadrePedido): number {
  const prod = cuadre.productosEntregados
  const precios = cuadre.preciosReales
  return (
    prod.cPacaAguaEnt * precios.pacaAgua +
    prod.cPacaHieloEnt * precios.pacaHielo +
    prod.cBotellonFabEnt * precios.botellonFab +
    prod.cBotellonDomEnt * precios.botellonDom +
    prod.cBolsaAguaEnt * precios.bolsaAgua +
    prod.cBolsaHieloEnt * precios.bolsaHielo
  )
}
