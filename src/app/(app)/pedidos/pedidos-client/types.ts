export interface PedidoItem {
  producto: string
  cantPedido: number
  cantEntrega: number
  precio: number
  subtotal: number
}

export interface Pedido {
  id: string
  numero: number
  clienteId: string
  nombreCli: string
  telefonoCli: string
  zonaCli: string
  tipo: string
  canal: string
  estado: string
  origen: string
  estadoEntrega: string
  estadoPago: string
  embarqueId?: string
  items: PedidoItem[]
  // Legacy fields (still present during transition)
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
  disputaAbierta?: boolean
  promesaPagoFecha?: string
  factura?: {
    id: string
    numero: string
    estado: string
    abonos?: Array<{
      id: string
      numero: string
      monto: number
      metodoPago: string
      fecha: string
      pedidoId?: string
    }>
  }
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

export const TIPOS = ['ENVIO', 'PUNTO']
export const ORIGENES = ['PEDIDO', 'VENTA_RAPIDA', 'VENTA_LIBRE']
export const ESTADOS_ENTREGA = ['PENDIENTE', 'EN_RUTA', 'ENTREGADO', 'NO_ENTREGADO', 'CANCELADO', 'ANULADO']
export const ESTADOS_PAGO = ['PENDIENTE', 'PARCIAL', 'PAGADO', 'ANTICIPADO', 'VENCIDO']
