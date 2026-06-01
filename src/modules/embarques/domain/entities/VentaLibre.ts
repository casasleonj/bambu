/**
 * VentaLibre Entity.
 *
 * Represents a walk-up sale (venta libre) made during an embarque route.
 * These are sales not tied to a specific pedido.
 */

export interface VentaLibreProps {
  id?: string
  embarqueId: string
  clienteNombre?: string
  clienteTelefono?: string
  direccion?: string
  barrio?: string
  producto: string
  cantidad: number
  precio: number
  metodoPago: string
  obs?: string
}

export class VentaLibre {
  readonly id?: string
  readonly embarqueId: string
  readonly clienteNombre?: string
  readonly clienteTelefono?: string
  readonly direccion?: string
  readonly barrio?: string
  readonly producto: string
  readonly cantidad: number
  readonly precio: number
  readonly metodoPago: string
  readonly obs?: string

  constructor(props: VentaLibreProps) {
    this.id = props.id
    this.embarqueId = props.embarqueId
    this.clienteNombre = props.clienteNombre
    this.clienteTelefono = props.clienteTelefono
    this.direccion = props.direccion
    this.barrio = props.barrio
    this.producto = props.producto
    this.cantidad = Math.max(0, props.cantidad)
    this.precio = Math.max(0, props.precio)
    this.metodoPago = props.metodoPago
    this.obs = props.obs
  }

  /**
   * Total amount for this venta libre.
   */
  total(): number {
    return this.cantidad * this.precio
  }

  toJSON(): VentaLibreProps {
    return {
      id: this.id,
      embarqueId: this.embarqueId,
      clienteNombre: this.clienteNombre,
      clienteTelefono: this.clienteTelefono,
      direccion: this.direccion,
      barrio: this.barrio,
      producto: this.producto,
      cantidad: this.cantidad,
      precio: this.precio,
      metodoPago: this.metodoPago,
      obs: this.obs,
    }
  }
}
