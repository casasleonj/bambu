/**
 * IEmbarqueRepository Interface.
 *
 * Port for Embarque persistence operations.
 * Implemented by infrastructure layer (Prisma).
 */

import { Embarque } from '../entities/Embarque'
import { EstadoEmbarque, type EstadoEmbarqueValue } from '../value-objects/EstadoEmbarque'
import { Carga } from '../value-objects/Carga'

export interface EmbarqueFilter {
  fechaDesde?: Date
  fechaHasta?: Date
  estado?: EstadoEmbarqueValue
  trabajadorId?: string
  rutaId?: string
  all?: boolean
}

export interface IEmbarqueRepository {
  findById(id: string, tx?: unknown): Promise<Embarque | null>
  findByTrabajadorAndFecha(trabajadorId: string, fecha: Date, tx?: unknown): Promise<Embarque | null>
  findMany(filters: EmbarqueFilter, tx?: unknown): Promise<Embarque[]>
  findWithPedidos(id: string, tx?: unknown): Promise<Embarque | null>
  findWithProductos(id: string, tx?: unknown): Promise<Embarque | null>
  findWithGastos(id: string, tx?: unknown): Promise<Embarque | null>
  create(embarque: {
    trabajadorId: string
    rutaId?: string
    carga: Carga
    tipoMoto?: string
    capacidadKg: number
    baseDinero: number
    stockSnapshot?: Record<string, number>
    codigoVisita?: string
    obs?: string
    createdById?: string
    numero: number
    numeroDia: number
  }, tx?: unknown): Promise<Embarque>
  update(id: string, data: Partial<{
    estado: EstadoEmbarque
    trabajadorId: string
    rutaId?: string
    horaSalida?: Date
    horaLlegada?: Date
    carga: Carga
    tipoMoto?: string
    baseDinero: number
    codigoVisita?: string
    obs?: string
    dineroEntregado: number
  }>, tx?: unknown): Promise<Embarque>
  delete(id: string, tx?: unknown): Promise<void>
  getNextNumeroDia(fecha: Date, tx?: unknown): Promise<number>
}
