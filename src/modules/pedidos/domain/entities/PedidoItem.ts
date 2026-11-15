/**
 * PedidoItem Entity.
 *
 * Represents a single line item in a Pedido.
 * Immutable except for delivery quantity.
 */

import { Money, UnitPrice } from '@/shared/domain'
import type { ProductCode } from '@/shared/domain'

export class PedidoItem {
  readonly precio: UnitPrice

  constructor(
    readonly producto: ProductCode,
    readonly cantPedido: number,
    precio: Money | UnitPrice,
    readonly precioOrigen: string,
    private _cantEntrega: number = 0,
  ) {
    if (cantPedido < 0) throw new Error('cantPedido no puede ser negativa')
    this.precio = precio instanceof UnitPrice ? precio : UnitPrice.fromDecimal(precio.toDecimal())
  }

  get cantEntrega(): number {
    return this._cantEntrega
  }

  get subtotalPedido(): Money {
    return this.precio.total(this.cantPedido)
  }

  get subtotalEntregado(): Money {
    return this.precio.total(this._cantEntrega)
  }

  get faltante(): number {
    return this.cantPedido - this._cantEntrega
  }

  /**
   * PR-1 (integridad de entrega parcial): `cantidad` es la cantidad ENTREGADA
   * AHORA (delta), que se ACUMULA sobre lo ya entregado. Antes se sobreescribía,
   * lo que impedía representar entregas sucesivas (6 ahora + 4 después = 10).
   * La entrega física NO toca precio ni pago.
   */
  entregar(cantidad: number): void {
    if (cantidad < 0) throw new Error('cantidad entregada no puede ser negativa')
    const acumulado = this._cantEntrega + cantidad
    if (acumulado > this.cantPedido) {
      throw new Error(`No se pueden entregar ${acumulado} unidades de ${this.producto} cuando solo se pidieron ${this.cantPedido}`)
    }
    this._cantEntrega = acumulado
  }

  cloneWithPrecio(nuevoPrecio: Money | UnitPrice, nuevoOrigen: string): PedidoItem {
    return new PedidoItem(this.producto, this.cantPedido, nuevoPrecio, nuevoOrigen, this._cantEntrega)
  }

  cloneForHijo(): PedidoItem {
    return new PedidoItem(this.producto, this.faltante, this.precio, this.precioOrigen, 0)
  }
}
