/**
 * IGastoEmbarqueRepository Interface.
 *
 * Port for Gasto persistence operations on embarques.
 */

import { GastoEmbarque } from '../entities/GastoEmbarque'

export interface IGastoEmbarqueRepository {
  findByEmbarqueId(embarqueId: string, tx?: unknown): Promise<GastoEmbarque[]>
  create(data: {
    embarqueId: string
    categoria: string
    descripcion: string
    monto: number
    responsable?: string
    notas?: string
    createdById?: string
  }, tx?: unknown): Promise<GastoEmbarque>
  delete(id: string, tx?: unknown): Promise<void>
}
