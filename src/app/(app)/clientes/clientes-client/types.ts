export interface ContactoAlternativo {
  nombre: string
  telefono: string
  relacion?: string
}

export interface Cliente {
  id: string
  clienteId: string
  nombre: string
  apellido?: string
  telefono: string
  nombreNegocio?: string
  tipoNegocio?: string
  fuente?: string
  barrio?: string
  linkUbicacion?: string
  direccion?: string
  contactos?: ContactoAlternativo[]
  frecuencia: string
  cadaNDias?: number
  proxEntrega?: string
  preciosEspeciales?: string
  notas?: string
  ultEntrega?: string
  activo: boolean
  verificado?: boolean
  bloqueado?: boolean
  reclamaciones?: number
  limitePedidosFiados?: number
  creadoPorRol?: string
  createdAt?: string
  saldoPendiente?: number
  _count?: { pedidos: number }
  pedidos?: Pedido[]
  facturas?: Factura[]
  negocios?: Array<{
    id: string
    nombre: string
    tipoNegocio?: string | null
    direccion?: string | null
    barrio?: string | null
    referencia?: string | null
  }>
  frecuenciaSugerida?: { dias: number; label: string } | null
  productosSugeridos?: Array<{ codigo: string; nombre: string; frecuencia: number; cantidadPromedio: number }>
  horaApertura?: string | null
  plantillaRecurrente?: {
    id: string
    activo: boolean
    cadaNDias: number
    horaPreferida: string | null
    productos: string
    ultimaGeneracion: string | null
    proxGeneracion: string | null
    tipo: string
    canal: string
    notas: string | null
  } | null
}

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
  total: number
  saldo: number
  totalPagado: number
  estado: string
  estadoEntrega: string
  estadoPago: string
  fecha: string
  // commit alertas: campos requeridos por PedidoBase (alertas-detector.ts).
  // clienteId es obligatorio; nombreCli/telefonoCli son opcionales en PedidoBase
  // pero la UI los muestra siempre (ver alertas-table.tsx L52, L280).
  clienteId: string
  nombreCli?: string
  telefonoCli?: string
  disputaAbierta?: boolean
  promesaPagoFecha?: string
  items?: PedidoItem[]
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
  factura?: {
    id: string
    numero: string
    abonos?: Array<{ monto: number; metodoPago: string; fecha: string; pedidoId?: string }>
  }
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
  { codigo: 'PACA_AGUA', nombre: 'Paca Agua', unidad: 'paca' },
  { codigo: 'PACA_HIELO', nombre: 'Paca Hielo', unidad: 'paca' },
  { codigo: 'BOTELLON', nombre: 'Botellón 20LT', unidad: 'und' },
  { codigo: 'BOLSA_AGUA', nombre: 'Bolsa Agua', unidad: 'bolsa' },
  { codigo: 'BOLSA_HIELO', nombre: 'Bolsa Hielo', unidad: 'bolsa' },
] as const

export const PRODUCTO_NOMBRES: Record<string, string> = {
  cPacaAguaPed: 'Paca Agua',
  cPacaHieloPed: 'Paca Hielo',
  cBotellonFabPed: 'Botellón Fábrica',
  cBotellonDomPed: 'Botellón Domicilio',
  cBolsaAguaPed: 'Bolsa Agua',
  cBolsaHieloPed: 'Bolsa Hielo',
}

export type FiltroRiesgo = 'bloqueado' | 'reclamaciones' | 'noVerificado' | null

export interface ClientesClientProps {
  initialClientes: Cliente[]
  initialLimiteFiados?: number
  openClienteId?: string
  totalClientes?: number
  filtroActivo?: FiltroRiesgo
}

export interface FormData {
  nombre: string
  apellido: string
  telefono: string
  fuente: string
  barrio: string
  direccion: string
  linkUbicacion: string
  contactos: ContactoAlternativo[]
  preciosEspeciales: string
  notas: string
  limitePedidosFiados?: number
}

export type TimelineEventType =
  | 'PEDIDO'
  | 'PAGO'
  | 'FACTURA'
  | 'ABONO'
  | 'CASO'
  | 'NOTA_CREDITO'
  | 'AUDITORIA'
  | 'EMBARQUE'

export type TimelineFilter = 'TODOS' | TimelineEventType

export interface TimelineEvent {
  id: string
  tipo: TimelineEventType
  fecha: string
  titulo: string
  descripcion?: string
  monto?: number
  estado?: string
  metodo?: string
  numero?: string | number
  link?: string
  metadata?: Record<string, unknown>
}

export interface ProductoFavorito {
  nombre: string
  cantidadTotal: number
  totalVendido: number
}

export interface EvolucionMensual {
  mes: string
  total: number
  pedidos: number
}

export interface MetodoPagoStats {
  metodo: string
  count: number
  total: number
}

export interface ClienteStats {
  totalComprado: number
  totalPagado: number
  totalFiado: number
  cantidadPedidos: number
  cantidadPedidosUltimos30: number
  cantidadPedidosUltimos90: number
  promedioPorPedido: number
  frecuenciaRealDias: number | null
  productosFavoritos: ProductoFavorito[]
  evolucionMensual: EvolucionMensual[]
  metodosPago: MetodoPagoStats[]
  diasPromedioPago: number | null
}
