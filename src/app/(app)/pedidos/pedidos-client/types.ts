export interface PedidoItem {
  producto: string
  cantPedido: number
  cantEntrega: number
  precio: number
  subtotal: number
  precioOrigen?: string
}

export interface PagoDetalle {
  id: string
  metodo: string
  monto: number
  fecha: string
  confirmacion: string | null
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
  /** Ubicación propia del pedido (destino de la entrega); `lat`/`lng` son las efectivas. */
  entregaLat?: number | null
  entregaLng?: number | null
  tipo: string
  canal: string
  estado: string
  origen: string
  estadoEntrega: string
  estadoPago: string
  // ADR-PAGO-REPORTADO-CONFIRMADO-001 §5 — señales ortogonales a estadoPago.
  pagoReportadoPendiente?: boolean
  pagoDiscrepante?: boolean
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
  // P1-1 PR B (#379) — extras que solo trae GET /api/pedidos/[id].
  direccionEntrega?: string | null
  fechaEntrega?: string | null
  entregadoAt?: string | null
  creadoPor?: string | null
  pagosDetalle?: PagoDetalle[]
  embarqueResumen?: {
    id: string
    numeroDia: number
    estado: string
    repartidor: string | null
    horaSalida?: string | null
  } | null
  entregaResumen?: { fecha: string | null; gpsLat: number | null; gpsLng: number | null; fotoUrl: string | null } | null
  pendienteN2?: { id: string; producto: string; remanente: number; estado: string } | null
  pedidosVinculados?: Array<{ id: string; numero: number; rol: 'demanda' | 'origen'; total: number; estadoEntrega: string }>
  casosAbiertos?: Array<{ id: string; alertaTipo: string; severidad: string; status: string }>
  recurrencia?: { id: string; cadaNDias: number; canal: string; activo: boolean; proximaFecha: string | null } | null
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

// G6 (ADR-PEDIDO-ORIGEN-CANAL-001): el filtro es "Canal" (PUNTO/DOMICILIO).
// `CANALES` vive en `@/lib/pedido-canal` (fuente única). `TIPOS` (ENVIO/PUNTO)
// se retira acá — la normalización legacy vive en `normalizeCanalFilter`.
export const ORIGENES = ['PEDIDO', 'VENTA_RAPIDA', 'VENTA_LIBRE', 'RECURRENTE']
export const ESTADOS_ENTREGA = ['PENDIENTE', 'EN_RUTA', 'ENTREGADO', 'NO_ENTREGADO', 'CANCELADO', 'ANULADO']
export const ESTADOS_PAGO = ['PENDIENTE', 'PARCIAL', 'PAGADO', 'ANTICIPADO', 'VENCIDO', 'ANULADO']
