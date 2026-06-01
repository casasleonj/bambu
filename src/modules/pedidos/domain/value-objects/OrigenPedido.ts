/**
 * OrigenPedido Value Object.
 */

import type { OrigenPedido } from '../types'
import { ORIGENES_PEDIDO } from '../types'

export class OrigenPedidoVO {
  private constructor(private readonly value: OrigenPedido) {}

  static from(origen: string): OrigenPedidoVO {
    const normalized = origen as OrigenPedido
    if (!ORIGENES_PEDIDO.includes(normalized)) {
      throw new Error(`OrigenPedido inválido: ${origen}`)
    }
    return new OrigenPedidoVO(normalized)
  }

  static create(origen: OrigenPedido): OrigenPedidoVO {
    return new OrigenPedidoVO(origen)
  }

  get(): OrigenPedido {
    return this.value
  }

  isVentaRapida(): boolean {
    return this.value === 'VENTA_RAPIDA'
  }

  equals(other: OrigenPedidoVO): boolean {
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }
}
