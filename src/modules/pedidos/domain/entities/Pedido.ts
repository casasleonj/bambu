/**
 * Pedido Entity.
 *
 * Core aggregate root of the pedidos bounded context.
 * Encapsulates all business rules for order lifecycle.
 */

import { Money } from '@/shared/domain'
import type { ProductCode } from '@/shared/domain'
import { PedidoId } from '../value-objects/PedidoId'
import { CanalVO } from '../value-objects/Canal'
import { OrigenPedidoVO } from '../value-objects/OrigenPedido'
import { EstadoEntregaVO } from '../value-objects/EstadoEntrega'
import { EstadoPagoVO } from '../value-objects/EstadoPago'
import { PedidoItem } from './PedidoItem'
import type { PagoData, PedidoHijoData } from '../types'

export interface PedidoProps {
  id: PedidoId
  numero: number
  clienteId: string
  negocioId?: string
  embarqueId?: string
  canal: CanalVO
  origen: OrigenPedidoVO
  estadoEntrega: EstadoEntregaVO
  estadoPago: EstadoPagoVO
  items: PedidoItem[]
  total: Money
  totalPagado: Money
  pagos: PagoData[]
  fecha: Date
  fechaEntrega?: Date
  obs?: string
  idOrigen?: string
  fotoEntrega?: string
  gpsLat?: number
  gpsLng?: number
  codigoVisita?: string
  createdById?: string
}

export class Pedido {
  private constructor(private props: PedidoProps) {}

  static create(props: PedidoProps): Pedido {
    return new Pedido({ ...props })
  }

  // ── Getters ────────────────────────────────────────────────────────────

  get id(): PedidoId { return this.props.id }
  get numero(): number { return this.props.numero }
  get clienteId(): string { return this.props.clienteId }
  get negocioId(): string | undefined { return this.props.negocioId }
  get embarqueId(): string | undefined { return this.props.embarqueId }
  get canal(): CanalVO { return this.props.canal }
  get origen(): OrigenPedidoVO { return this.props.origen }
  get estadoEntrega(): EstadoEntregaVO { return this.props.estadoEntrega }
  get estadoPago(): EstadoPagoVO { return this.props.estadoPago }
  get items(): readonly PedidoItem[] { return this.props.items }
  get total(): Money { return this.props.total }
  get totalPagado(): Money { return this.props.totalPagado }
  get saldo(): Money { return this.props.total.subtract(this.props.totalPagado) }
  get pagos(): readonly PagoData[] { return this.props.pagos }
  get fecha(): Date { return this.props.fecha }
  get fechaEntrega(): Date | undefined { return this.props.fechaEntrega }
  get obs(): string | undefined { return this.props.obs }
  get idOrigen(): string | undefined { return this.props.idOrigen }
  get fotoEntrega(): string | undefined { return this.props.fotoEntrega }
  get gpsLat(): number | undefined { return this.props.gpsLat }
  get gpsLng(): number | undefined { return this.props.gpsLng }
  get codigoVisita(): string | undefined { return this.props.codigoVisita }

  // ── Business Rules ─────────────────────────────────────────────────────

  puedeEntregar(): boolean {
    return this.props.estadoEntrega.canTransitionTo(EstadoEntregaVO.create('ENTREGADO'))
  }

  puedeCancelar(): boolean {
    return this.props.estadoEntrega.canTransitionTo(EstadoEntregaVO.create('CANCELADO'))
  }

  puedeAnular(): boolean {
    return this.props.estadoEntrega.equals(EstadoEntregaVO.create('ENTREGADO'))
  }

  puedeAsignarEmbarque(): boolean {
    return this.props.estadoEntrega.get() === 'PENDIENTE'
  }

  // ── State Mutations ────────────────────────────────────────────────────

  /**
   * Mark as EN_RUTA and assign to an embarque.
   */
  asignarEmbarque(embarqueId: string): void {
    if (!this.puedeAsignarEmbarque()) {
      throw new Error(`No se puede asignar embarque al pedido ${this.id.get()} en estado ${this.estadoEntrega.get()}`)
    }
    this.props = {
      ...this.props,
      embarqueId,
      estadoEntrega: EstadoEntregaVO.create('EN_RUTA'),
    }
  }

  /**
   * Remove from embarque and return to PENDIENTE.
   */
  desasignarEmbarque(): void {
    this.props = {
      ...this.props,
      embarqueId: undefined,
      estadoEntrega: EstadoEntregaVO.create('PENDIENTE'),
    }
  }

  /**
   * Record delivery of items. Recalculates total based on delivered quantities.
   */
  entregar(entregas: Array<{ producto: ProductCode; cantidad: number }>): void {
    if (!this.puedeEntregar()) {
      throw new Error(`Transición inválida: ${this.estadoEntrega.get()} → ENTREGADO`)
    }

    for (const e of entregas) {
      const item = this.props.items.find(i => i.producto === e.producto)
      if (!item) {
        throw new Error(`Producto ${e.producto} no encontrado en pedido ${this.id.get()}`)
      }
      item.entregar(e.cantidad)
    }

    const nuevoTotal = this.props.items.reduce(
      (sum, i) => sum.add(i.subtotalEntregado),
      new Money(0),
    )

    this.props = {
      ...this.props,
      estadoEntrega: EstadoEntregaVO.create('ENTREGADO'),
      total: nuevoTotal,
      estadoPago: EstadoPagoVO.fromTotals(
        nuevoTotal.toDecimal(),
        this.props.totalPagado.toDecimal(),
      ),
    }
  }

  /**
   * Register a payment and recalculate payment state.
   */
  registrarPago(pago: PagoData): void {
    if (this.props.estadoEntrega.isTerminal()) {
      throw new Error(`No se puede registrar pago en pedido ${this.id.get()} con estado ${this.props.estadoEntrega.get()}`)
    }

    const nuevosPagos = [...this.props.pagos, pago]
    const nuevoTotalPagado = new Money(
      this.props.totalPagado.cents + Math.round(pago.monto * 100),
    )

    this.props = {
      ...this.props,
      pagos: nuevosPagos,
      totalPagado: nuevoTotalPagado,
      estadoPago: EstadoPagoVO.fromTotals(
        this.props.total.toDecimal(),
        nuevoTotalPagado.toDecimal(),
      ),
    }
  }

  /**
   * Mark as CANCELADO. Resets totals. Returns true if there were payments (nota crédito needed).
   */
  cancelar(): boolean {
    if (!this.puedeCancelar()) {
      throw new Error(`No se puede cancelar pedido ${this.id.get()} en estado ${this.estadoEntrega.get()}`)
    }

    const tuvoPagos = this.props.totalPagado.cents > 0

    this.props = {
      ...this.props,
      estadoEntrega: EstadoEntregaVO.create('CANCELADO'),
      estadoPago: EstadoPagoVO.create('ANULADO'),
      totalPagado: new Money(0),
      total: new Money(0),
    }

    return tuvoPagos
  }

  /**
   * Mark as ANULADO (only from ENTREGADO). Resets totals.
   */
  anular(): boolean {
    if (!this.puedeAnular()) {
      throw new Error(`Solo se pueden anular pedidos ENTREGADOS. Estado actual: ${this.estadoEntrega.get()}`)
    }

    const tuvoPagos = this.props.totalPagado.cents > 0

    this.props = {
      ...this.props,
      estadoEntrega: EstadoEntregaVO.create('ANULADO'),
      estadoPago: EstadoPagoVO.create('ANULADO'),
      totalPagado: new Money(0),
    }

    return tuvoPagos
  }

  /**
   * Create a child order with undelivered items (for PARCIAL delivery).
   */
  crearPedidoHijo(numeroHijo: number): PedidoHijoData | null {
    const faltantes = this.props.items
      .filter(i => i.faltante > 0)
      .map(i => ({
        producto: i.producto,
        cantidad: i.faltante,
        precio: i.precio.toDecimal(),
      }))

    if (faltantes.length === 0) return null

    const totalHijo = faltantes.reduce((sum, f) => sum + f.precio * f.cantidad, 0)

    return {
      numero: numeroHijo,
      clienteId: this.props.clienteId,
      canal: this.props.canal.get(),
      origen: this.props.origen.get(),
      total: totalHijo,
      items: faltantes,
    }
  }

  // ── Legacy Synchronization ───────────────────────────────────────────

  /**
   * Returns legacy field map for Prisma persistence.
   * This is a bridge method used by the infrastructure mapper.
   */
  toLegacyFields(): Record<string, number> {
    const result: Record<string, number> = {}

    const getCantPed = (code: ProductCode) =>
      this.props.items.find(i => i.producto === code)?.cantPedido ?? 0
    const getCantEnt = (code: ProductCode) =>
      this.props.items.find(i => i.producto === code)?.cantEntrega ?? 0
    const getPrecio = (code: ProductCode) =>
      this.props.items.find(i => i.producto === code)?.precio.toDecimal() ?? 0

    result.cPacaAguaPed = getCantPed('PACA_AGUA')
    result.cPacaHieloPed = getCantPed('PACA_HIELO')
    result.cBolsaAguaPed = getCantPed('BOLSA_AGUA')
    result.cBolsaHieloPed = getCantPed('BOLSA_HIELO')
    result.cPacaAguaEnt = getCantEnt('PACA_AGUA')
    result.cPacaHieloEnt = getCantEnt('PACA_HIELO')
    result.cBolsaAguaEnt = getCantEnt('BOLSA_AGUA')
    result.cBolsaHieloEnt = getCantEnt('BOLSA_HIELO')

    // Botellón split by canal
    const botellonCantPed = getCantPed('BOTELLON')
    const botellonCantEnt = getCantEnt('BOTELLON')
    if (this.props.canal.get() === 'PUNTO') {
      result.cBotellonFabPed = botellonCantPed
      result.cBotellonFabEnt = botellonCantEnt
    } else {
      result.cBotellonDomPed = botellonCantPed
      result.cBotellonDomEnt = botellonCantEnt
    }

    result.precioPacaAgua = getPrecio('PACA_AGUA')
    result.precioPacaHielo = getPrecio('PACA_HIELO')
    result.precioBolsaAgua = getPrecio('BOLSA_AGUA')
    result.precioBolsaHielo = getPrecio('BOLSA_HIELO')
    result.precioBotellonFab = this.props.canal.get() === 'PUNTO' ? getPrecio('BOTELLON') : 0
    result.precioBotellonDom = this.props.canal.get() === 'DOMICILIO' ? getPrecio('BOTELLON') : 0

    return result
  }
}
