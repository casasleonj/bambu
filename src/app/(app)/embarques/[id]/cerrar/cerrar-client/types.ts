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
  // PR-1: unidades ya entregadas (un pedido re-planificado que completa su
  // faltante llega con cXEnt > 0). El wizard muestra "ya entregado" y el
  // input "Entregó" se interpreta como lo entregado EN ESTE cierre (delta).
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

/**
 * - `OTRA_VISITA`: lo que falta sigue siendo del mismo pedido y se entrega después.
 * - `NO_QUIERE_RESTO`: el cliente dijo que no quiere el resto. La reducción
 *   comercial aún no tiene operación económica (#451): se registra el hecho en
 *   las observaciones del cierre, el total NO cambia y el pendiente se trata
 *   como `OTRA_VISITA` hasta que la oficina lo autorice.
 */
export type DecisionPendiente = 'OTRA_VISITA' | 'NO_QUIERE_RESTO'

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
  /**
   * Cierre V2 (#447): qué pasa con lo que queda pendiente cuando se entrega
   * menos de lo pedido. Sin valor por defecto: lo elige el asistente.
   */
  decisionPendiente?: DecisionPendiente
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
  /** Cierre V2: «venta al paso» (CONSUMIDOR_FINAL) elegida de forma explícita. */
  anonima?: boolean
  /** Cierre V2: el cliente elegido está bloqueado (viene del buscador). */
  clienteBloqueado?: boolean
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
