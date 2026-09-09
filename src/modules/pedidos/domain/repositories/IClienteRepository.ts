/**
 * IClienteRepository — Domain Port.
 *
 * Contract for Cliente data access needed by the Pedidos bounded context.
 */

/** Campos de geolocalización compartidos por Cliente y Negocio (suficiencia de entrega). */
export interface GeoBasico {
  referencia?: string
  linkUbicacion?: string
  lat?: number | null
  lng?: number | null
}

export interface ClienteBasico extends GeoBasico {
  id: string
  nombre: string
  apellido?: string
  telefono: string
  direccion?: string
  barrio?: string
  bloqueado: boolean
  verificado: boolean
  creadoPorRol: string
  limitePedidosFiados: number | null
  preciosEspeciales: string | null
  /** procedencia de lat/lng: 'PARSED_URL' | 'GPS_HISTORIAL' | 'NEGOCIO' | 'MANUAL' | null */
  geocodeOrigen?: string | null
}

export interface NegocioBasico extends GeoBasico {
  id: string
  nombre: string
  direccion?: string
  barrio?: string
  preciosEspeciales: string | null
}

import type { TransactionClient } from '../../infrastructure/transactions/PrismaTransactionManager'

export interface IClienteRepository {
  findById(id: string, tx?: TransactionClient): Promise<ClienteBasico | null>
  findByTelefono(telefono: string, tx?: TransactionClient): Promise<{ id: string } | null>
  create(data: {
    nombre: string
    apellido?: string
    telefono: string
    direccion?: string
    barrio?: string
    fuente?: string
    creadoPorRol: string
  }, tx?: TransactionClient): Promise<{ id: string }>
  updateDireccion(
    id: string,
    direccion: string,
    barrio?: string,
    tx?: TransactionClient,
    meta?: { usuarioId?: string | null; pedidoId?: string },
  ): Promise<void>
  findNegocioById(id: string, tx?: TransactionClient): Promise<NegocioBasico | null>
  /**
   * FIX Fase 2 §3.4: incrementar saldoFavor del cliente (crédito por
   * pago que excedió el total de un pedido).
   */
  incrementarSaldoFavor(id: string, monto: number, tx?: TransactionClient): Promise<void>
  /**
   * FIX Fase 2 §3.4: leer saldoFavor actual del cliente.
   */
  getSaldoFavor(id: string, tx?: TransactionClient): Promise<number>
  /**
   * FIX Fase 2 §3.4: aplicar saldo a favor al pedido (decrementa saldoFavor).
   * Devuelve el monto realmente aplicado (puede ser menor al saldo si el
   * pedido es chico).
   */
  aplicarSaldoFavor(id: string, monto: number, tx?: TransactionClient): Promise<number>
}
