/**
 * EmbarqueProducto Entity.
 *
 * Tracks per-product quantities for an embarque:
 * - cargadas: loaded onto the vehicle
 * - devueltas: returned unsold
 * - cambios: exchanged (empty for full)
 * - rotas: broken/damaged
 */

import { type ProductCode } from '../value-objects/Carga'

export interface EmbarqueProductoProps {
  id: string
  embarqueId: string
  producto: ProductCode
  cargadas: number
  devueltas: number
  cambios: number
  rotas: number
}

export class EmbarqueProducto {
  readonly id: string
  readonly embarqueId: string
  readonly producto: ProductCode
  readonly cargadas: number
  readonly devueltas: number
  readonly cambios: number
  readonly rotas: number

  constructor(props: EmbarqueProductoProps) {
    this.id = props.id
    this.embarqueId = props.embarqueId
    this.producto = props.producto
    this.cargadas = Math.max(0, props.cargadas ?? 0)
    this.devueltas = Math.max(0, props.devueltas ?? 0)
    this.cambios = Math.max(0, props.cambios ?? 0)
    this.rotas = Math.max(0, props.rotas ?? 0)
  }

  /**
   * Units actually delivered (loaded - returned).
   */
  entregadas(): number {
    return this.cargadas - this.devueltas
  }

  /**
   * Units lost (broken + exchanged).
   */
  perdidas(): number {
    return this.rotas + this.cambios
  }

  /**
   * Returns a new instance with updated conciliation data.
   */
  withConciliacion(devueltas: number, cambios: number, rotas: number): EmbarqueProducto {
    return new EmbarqueProducto({
      ...this,
      devueltas,
      cambios,
      rotas,
    })
  }

  toJSON(): EmbarqueProductoProps {
    return {
      id: this.id,
      embarqueId: this.embarqueId,
      producto: this.producto,
      cargadas: this.cargadas,
      devueltas: this.devueltas,
      cambios: this.cambios,
      rotas: this.rotas,
    }
  }
}
