/**
 * Embarque Entity (Aggregate Root).
 *
 * Represents a delivery shipment assigned to a worker (repartidor).
 * Manages the lifecycle: ABIERTO -> EN_RUTA -> CERRADO (or CANCELADO).
 */

import { EstadoEmbarque } from '../value-objects/EstadoEmbarque'
import { Carga, ProductCode } from '../value-objects/Carga'
import { EmbarqueId } from '../value-objects/EmbarqueId'
import { CapacidadInfo } from '../value-objects/CapacidadInfo'
import { EmbarqueProducto } from './EmbarqueProducto'
import { GastoEmbarque } from './GastoEmbarque'

export interface EmbarqueProps {
  id: string
  numero: number
  numeroDia: number
  fecha: Date
  trabajadorId: string
  trabajadorNombre?: string
  rutaId?: string
  rutaNombre?: string
  horaSalida?: Date
  horaLlegada?: Date
  estado: EstadoEmbarque
  carga: Carga
  tipoMoto?: string
  capacidadKg: number
  baseDinero: number
  dineroEntregado: number
  stockSnapshot?: Record<string, number>
  codigoVisita?: string
  obs?: string
  createdById?: string
  productos?: EmbarqueProducto[]
  gastos?: GastoEmbarque[]
  createdAt: Date
  updatedAt: Date
}

export class Embarque {
  readonly id: EmbarqueId
  readonly numero: number
  readonly numeroDia: number
  readonly fecha: Date
  readonly trabajadorId: string
  readonly trabajadorNombre?: string
  readonly rutaId?: string
  readonly rutaNombre?: string
  readonly horaSalida?: Date
  readonly horaLlegada?: Date
  readonly estado: EstadoEmbarque
  readonly carga: Carga
  readonly tipoMoto?: string
  readonly capacidadKg: number
  readonly baseDinero: number
  readonly dineroEntregado: number
  readonly stockSnapshot?: Record<string, number>
  readonly codigoVisita?: string
  readonly obs?: string
  readonly createdById?: string
  readonly productos: EmbarqueProducto[]
  readonly gastos: GastoEmbarque[]
  readonly createdAt: Date
  readonly updatedAt: Date

  constructor(props: EmbarqueProps) {
    this.id = new EmbarqueId(props.id)
    this.numero = props.numero
    this.numeroDia = props.numeroDia
    this.fecha = props.fecha
    this.trabajadorId = props.trabajadorId
    this.trabajadorNombre = props.trabajadorNombre
    this.rutaId = props.rutaId
    this.rutaNombre = props.rutaNombre
    this.horaSalida = props.horaSalida
    this.horaLlegada = props.horaLlegada
    this.estado = props.estado
    this.carga = props.carga
    this.tipoMoto = props.tipoMoto
    this.capacidadKg = props.capacidadKg
    this.baseDinero = props.baseDinero
    this.dineroEntregado = props.dineroEntregado
    this.stockSnapshot = props.stockSnapshot
    this.codigoVisita = props.codigoVisita
    this.obs = props.obs
    this.createdById = props.createdById
    this.productos = props.productos ?? []
    this.gastos = props.gastos ?? []
    this.createdAt = props.createdAt
    this.updatedAt = props.updatedAt
  }

  /**
   * Returns the current capacity status.
   */
  getCapacidad(): CapacidadInfo {
    return CapacidadInfo.fromPeso(
      this.carga.pesoKg(),
      this.capacidadKg,
      this.carga.totalUnidades(),
    )
  }

  /**
   * Returns total units in the carga.
   */
  totalUnidades(): number {
    return this.carga.totalUnidades()
  }

  /**
   * Returns total weight in KG.
   */
  pesoKg(): number {
    return this.carga.pesoKg()
  }

  /**
   * Returns true if the embarque can be edited.
   */
  canEdit(): boolean {
    return this.estado.canEdit()
  }

  /**
   * Returns true if pedidos can be assigned/removed.
   */
  canModifyPedidos(): boolean {
    return this.estado.canModifyPedidos()
  }

  /**
   * Returns true if gastos can be added/removed.
   */
  canModifyGastos(): boolean {
    return this.estado.canModifyGastos()
  }

  /**
   * Returns true if the embarque can be closed.
   */
  canCerrar(): boolean {
    return this.estado.canCerrar()
  }

  /**
   * Returns the EmbarqueProducto for a given product code.
   */
  getProducto(producto: ProductCode): EmbarqueProducto | undefined {
    return this.productos.find((p) => p.producto === producto)
  }

  /**
   * Returns total gastos amount.
   */
  totalGastos(): number {
    return this.gastos.reduce((sum, g) => sum + g.monto, 0)
  }

  /**
   * Returns true if the embarque has any pedidos assigned.
   * (Checked via productos having cargadas > 0)
   */
  hasCarga(): boolean {
    return !this.carga.isEmpty()
  }

  toJSON(): EmbarqueProps {
    return {
      id: this.id.value,
      numero: this.numero,
      numeroDia: this.numeroDia,
      fecha: this.fecha,
      trabajadorId: this.trabajadorId,
      trabajadorNombre: this.trabajadorNombre,
      rutaId: this.rutaId,
      rutaNombre: this.rutaNombre,
      horaSalida: this.horaSalida,
      horaLlegada: this.horaLlegada,
      estado: this.estado,
      carga: this.carga,
      tipoMoto: this.tipoMoto,
      capacidadKg: this.capacidadKg,
      baseDinero: this.baseDinero,
      dineroEntregado: this.dineroEntregado,
      stockSnapshot: this.stockSnapshot,
      codigoVisita: this.codigoVisita,
      obs: this.obs,
      createdById: this.createdById,
      productos: this.productos,
      gastos: this.gastos,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    }
  }
}
