/**
 * IClienteRepository — Domain Port.
 *
 * Contract for Cliente data access needed by the Pedidos bounded context.
 */

export interface ClienteBasico {
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
}

export interface NegocioBasico {
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
  updateDireccion(id: string, direccion: string, barrio?: string, tx?: TransactionClient): Promise<void>
  findNegocioById(id: string, tx?: TransactionClient): Promise<NegocioBasico | null>
}
