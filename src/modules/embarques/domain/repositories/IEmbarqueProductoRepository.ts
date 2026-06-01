/**
 * IEmbarqueProductoRepository Interface.
 *
 * Port for EmbarqueProducto persistence operations.
 */

import { EmbarqueProducto } from '../entities/EmbarqueProducto'
import { ProductCode } from '../value-objects/Carga'

export interface IEmbarqueProductoRepository {
  findByEmbarqueId(embarqueId: string, tx?: unknown): Promise<EmbarqueProducto[]>
  create(data: {
    embarqueId: string
    producto: ProductCode
    cargadas: number
    devueltas: number
    cambios: number
    rotas: number
  }, tx?: unknown): Promise<EmbarqueProducto>
  update(id: string, data: Partial<{
    cargadas: number
    devueltas: number
    cambios: number
    rotas: number
  }>, tx?: unknown): Promise<EmbarqueProducto>
  upsert(embarqueId: string, producto: ProductCode, data: {
    cargadas: number
    devueltas: number
    cambios: number
    rotas: number
  }, tx?: unknown): Promise<EmbarqueProducto>
}
