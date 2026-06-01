/**
 * PedidoItem Entity.
 *
 * Represents a single line item in a Pedido.
 * Immutable except for delivery quantity.
 */

import { Money } from '@/shared/domain'
import type { ProductCode } from '@/shared/domain'

export class PedidoItem {
  constructor(
    readonly producto: ProductCode,
    readonly cantPedido: number,
    readonly precio: Money,
    readonly precioOrigen: string,
    private _cantEntrega: number = 0,
  ) {
    if (cantPedido < 0) throw new Error('cantPedido no puede ser negativa')
    if (precio.cents < 0) throw new Error('precio no puede ser negativo')
  }

  get cantEntrega(): number {
    return this._cantEntrega
  }

  get subtotalPedido(): Money {
    return new Money(this.precio.cents * this.cantPedido)
  }

  get subtotalEntregado(): Money {
    return new Money(this.precio.cents * this._cantEntrega)
  }

  get faltante(): number {
    return this.cantPedido - this._cantEntrega
  }

  entregar(cantidad: number): void {
    if (cantidad < 0) throw new Error('cantidad entregada no puede ser negativa')
    if (cantidad > this.cantPedido) {
      throw new Error(`No se pueden entregar ${cantidad} unidades de ${this.producto} cuando solo se pidieron ${this.cantPedido}`)
    }
    this._cantEntrega = cantidad
  }

  cloneWithPrecio(nuevoPrecio: Money, nuevoOrigen: string): PedidoItem {
    return new PedidoItem(this.producto, this.cantPedido, nuevoPrecio, nuevoOrigen, this._cantEntrega)
  }

  cloneForHijo(): PedidoItem {
    return new PedidoItem(this.producto, this.faltante, this.precio, this.precioOrigen, 0)
  }
}
