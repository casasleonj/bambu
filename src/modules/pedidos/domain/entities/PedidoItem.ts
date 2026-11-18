/**
 * PedidoItem Entity.
 *
 * Represents a single line item in a Pedido.
 * Immutable except for delivery quantity.
 */

import { Money, UnitPrice } from '@/shared/domain'
import type { ProductCode } from '@/shared/domain'

/** Autorización ya comprobada por el servidor; el dominio no concede permisos. */
export interface RegaloPedidoItem {
  cantidad: number
  entregada?: number
  autorizadoPorId: string
  autorizadoEn: Date
  motivo: string
}

const MAX_CANTIDAD_FISICA = 2_147_483_647 // columnas PostgreSQL Int de cantidades

function validarCantidadRegalo(cantidad: number): void {
  if (!Number.isSafeInteger(cantidad) || cantidad < 0 || cantidad > MAX_CANTIDAD_FISICA) {
    throw new Error('CANTIDAD_REGALO_INVALIDA')
  }
}

export class PedidoItem {
  readonly precio: UnitPrice
  private readonly regaloPedido?: Omit<RegaloPedidoItem, 'entregada'>
  private _cantRegaloEntrega = 0

  constructor(
    readonly producto: ProductCode,
    readonly cantPedido: number,
    precio: Money | UnitPrice,
    readonly precioOrigen: string,
    private _cantEntrega: number = 0,
    regalo?: RegaloPedidoItem,
  ) {
    if (cantPedido < 0) throw new Error('cantPedido no puede ser negativa')
    this.precio = precio instanceof UnitPrice ? precio : UnitPrice.fromDecimal(precio.toDecimal())
    if (regalo) {
      validarCantidadRegalo(regalo.cantidad)
      validarCantidadRegalo(regalo.entregada ?? 0)
      if ((regalo.entregada ?? 0) > regalo.cantidad) throw new Error('REGALO_ENTREGADO_SUPERA_PEDIDO')
      if (regalo.cantidad > 0) {
        validarCantidadRegalo(cantPedido)
        validarCantidadRegalo(_cantEntrega)
        if (_cantEntrega > cantPedido || cantPedido + regalo.cantidad > MAX_CANTIDAD_FISICA) {
          throw new Error('CANTIDAD_FISICA_INVALIDA')
        }
        if (!regalo.autorizadoPorId.trim() || !regalo.motivo.trim() || !Number.isFinite(regalo.autorizadoEn.getTime())) {
          throw new Error('REGALO_SIN_AUTORIZACION')
        }
        this.regaloPedido = {
          cantidad: regalo.cantidad,
          autorizadoPorId: regalo.autorizadoPorId,
          autorizadoEn: new Date(regalo.autorizadoEn),
          motivo: regalo.motivo.trim(),
        }
        this._cantRegaloEntrega = regalo.entregada ?? 0
      }
    }
  }

  get cantRegaloPedido(): number { return this.regaloPedido?.cantidad ?? 0 }
  get cantRegaloEntrega(): number { return this._cantRegaloEntrega }
  get cantidadFisicaPedida(): number { return this.cantPedido + this.cantRegaloPedido }
  get cantidadFisicaEntregada(): number { return this.cantEntrega + this.cantRegaloEntrega }
  get faltanteRegalo(): number { return this.cantRegaloPedido - this.cantRegaloEntrega }
  get faltanteFisico(): number { return this.faltante + this.faltanteRegalo }
  get regalo(): RegaloPedidoItem | undefined {
    return this.regaloPedido ? {
      ...this.regaloPedido,
      autorizadoEn: new Date(this.regaloPedido.autorizadoEn),
      entregada: this.cantRegaloEntrega,
    } : undefined
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
  entregar(cantidad: number, cantidadRegalo = 0): void {
    if (cantidad < 0) throw new Error('cantidad entregada no puede ser negativa')
    validarCantidadRegalo(cantidadRegalo)
    if (this.regaloPedido) validarCantidadRegalo(cantidad)
    const regaloAcumulado = this.cantRegaloEntrega + cantidadRegalo
    if (regaloAcumulado > this.cantRegaloPedido) throw new Error('REGALO_ENTREGADO_SUPERA_PEDIDO')
    const acumulado = this._cantEntrega + cantidad
    if (acumulado > this.cantPedido) {
      throw new Error(`No se pueden entregar ${acumulado} unidades de ${this.producto} cuando solo se pidieron ${this.cantPedido}`)
    }
    this._cantEntrega = acumulado
    this._cantRegaloEntrega = regaloAcumulado
  }

  cloneWithPrecio(nuevoPrecio: Money | UnitPrice, nuevoOrigen: string): PedidoItem {
    return new PedidoItem(this.producto, this.cantPedido, nuevoPrecio, nuevoOrigen, this._cantEntrega, this.regalo)
  }

  cloneForHijo(): PedidoItem {
    // PR-1 cumple el faltante en el mismo pedido. El camino legado no puede
    // trasladar una autorización a otro pedido ni perder regalos pendientes.
    if (this.faltanteRegalo > 0) throw new Error('REGALO_REQUIERE_ENTREGA_EN_PEDIDO_ORIGINAL')
    return new PedidoItem(this.producto, this.faltante, this.precio, this.precioOrigen, 0)
  }
}
