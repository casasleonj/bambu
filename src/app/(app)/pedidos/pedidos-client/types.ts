export interface PedidoItem {
  producto: string
  cantPedido: number
  cantEntrega: number
  precio: number
  subtotal: number
  precioOrigen?: string
}

export interface Pedido {
  id: string
  numero: number
  clienteId: string
  negocioId?: string | null
  nombreCli: string
  apellidoCli?: string | null
  telefonoCli: string
  zonaCli: string
  barrioCli: string
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
  horaPreferida?: string | null
  obs?: string | null
  nombreNegocioCli?: string | null
  horaAperturaCli?: string | null
  // Coords efectivas del pedido (negocio gana, fallback cliente).
  // Las agregan API y SSR vía pickCoords; null si no hay fuente con coords.
  lat?: number | null
  lng?: number | null
  disputaAbierta?: boolean
  promesaPagoFecha?: string
  /** Fila optimista: pedido creado offline, aun encolado en requestQueue. */
  _pendingSync?: boolean
  /** offlineId de la request encolada — para reconciliar contra bambu:sync-item-done. */
  _pendingOfflineId?: string
  /** El sync intentó enviarlo y el server lo rechazó de forma permanente
   *  (ej. límite de fiado excedido) — no se reintentará más. */
  _pendingFailed?: boolean
  _pendingFailReason?: string
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

export interface EmbarqueProducto {
  producto: string
  cargadas: number
}

export interface Embarque {
  id: string
  numero: number
  numeroDia: number
  trabajador: { nombre: string; capacidadKg?: number }
  estado: string
  ruta?: { nombre: string } | null
  totalPacas?: number
  horaSalida?: string | null
  tipoMoto?: string | null
  pedidos?: Array<{ id: string }>
  productos?: EmbarqueProducto[]
  _count?: { pedidos: number }
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

export interface Cliente {
  id: string
  nombre: string
  telefono: string
  direccion?: string
  barrio?: string
  lat?: number | null
  lng?: number | null
  preciosEspeciales?: string
  limitePedidosFiados?: number | null
}

// G6 (ADR-PEDIDO-ORIGEN-CANAL-001): el filtro pasa de "Tipo" (ENVIO/PUNTO,
// derivado) a "Canal" (PUNTO/DOMICILIO, canónico). `TIPOS` se mantiene solo
// para normalizar params legacy `?tipo=` (ver normalizeCanalParam).
export const CANALES = ['PUNTO', 'DOMICILIO']
export const TIPOS = ['ENVIO', 'PUNTO']
export const ORIGENES = ['PEDIDO', 'VENTA_RAPIDA', 'VENTA_LIBRE', 'RECURRENTE']
export const ESTADOS_ENTREGA = ['PENDIENTE', 'EN_RUTA', 'ENTREGADO', 'NO_ENTREGADO', 'CANCELADO', 'ANULADO']
export const ESTADOS_PAGO = ['PENDIENTE', 'PARCIAL', 'PAGADO', 'ANTICIPADO', 'VENCIDO', 'ANULADO']
