/**
 * Application Layer DTOs for Pedidos.
 */

import type { ProductCode } from '@/shared/domain'
import type { Canal, OrigenPedido, PagoData } from '../../domain/types'

export interface CrearPedidoInput {
  clienteId: string
  negocioId?: string
  canal: Canal
  origen?: OrigenPedido
  items: Array<{ producto: ProductCode; cantidad: number; precioManual?: number }>
  pagos?: PagoData[]
  obs?: string
  fechaEntrega?: Date
  ventaRapida?: boolean
  clienteNuevo?: {
    nombre: string
    apellido?: string
    telefono: string
    direccion?: string
    barrio?: string
    fuente?: string
  }
  actualizarCliente?: {
    direccion?: string
    barrio?: string
  }
  createdById?: string
  createdByRole?: string
  // Offline-first: id generado por el cliente para dedup al reenviar
  offlineId?: string
}

export interface ActualizarPedidoInput {
  pedidoId: string
  items?: Array<{ producto: ProductCode; cantidad: number; precioManual?: number }>
  estadoEntrega?: string
  obs?: string
  actualizarCliente?: {
    direccion?: string
    barrio?: string
  }
  offlineId?: string
}

export interface EntregarPedidoInput {
  pedidoId: string
  itemsEntregados: Array<{ producto: ProductCode; cantidad: number }>
  pagos?: PagoData[]
  fotoEntrega?: string
  gpsLat?: number
  gpsLng?: number
  codigoVisita?: string
  offlineId?: string
}

export interface AnularPedidoInput {
  pedidoId: string
  motivo?: string
  offlineId?: string
}

export interface CancelarPedidoInput {
  pedidoId: string
}

export interface ListarPedidosInput {
  clienteId?: string
  desde?: Date
  hasta?: Date
  estadoEntrega?: string
  estadoPago?: string
  origen?: string
  embarqueId?: string
  page?: number
  pageSize?: number
  all?: boolean
}

export interface PedidoResumenDTO {
  id: string
  numero: number
  clienteId: string
  negocioId?: string
  embarqueId?: string | null
  canal: string
  origen: string
  estado: string
  estadoEntrega: string
  estadoPago: string
  total: number
  totalPagado: number
  saldo: number
  fecha: string
  fechaEntrega?: string
  obs?: string
  // Legacy price fields (for backward compat with UI and tests)
  precioPacaAgua: number
  precioPacaHielo: number
  precioBotellonFab: number
  precioBotellonDom: number
  precioBolsaAgua: number
  precioBolsaHielo: number
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
  items: Array<{
    producto: string
    cantPedido: number
    cantEntrega: number
    precio: number
    subtotal: number
    precioOrigen: string
  }>
  pagos: Array<{
    metodo: string
    monto: number
  }>
}

export interface CrearPedidoResult {
  pedido: PedidoResumenDTO
  clienteId: string
}

export interface EntregarPedidoResult {
  pedido: PedidoResumenDTO
  hijo?: PedidoResumenDTO
}
