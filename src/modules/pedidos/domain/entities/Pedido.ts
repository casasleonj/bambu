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
  gpsAccuracy?: number
  gpsJustificacion?: string
  entregadoConGps?: boolean
  entregadoAt?: Date
  codigoVisita?: string
  adminOverrideNota?: string
  adminOverrideBy?: string
  adminOverrideAt?: Date
  offlineId?: string
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
  get gpsAccuracy(): number | undefined { return this.props.gpsAccuracy }
  get gpsJustificacion(): string | undefined { return this.props.gpsJustificacion }
  get entregadoConGps(): boolean | undefined { return this.props.entregadoConGps }
  get entregadoAt(): Date | undefined { return this.props.entregadoAt }
  get codigoVisita(): string | undefined { return this.props.codigoVisita }
  get adminOverrideNota(): string | undefined { return this.props.adminOverrideNota }
  get adminOverrideBy(): string | undefined { return this.props.adminOverrideBy }
  get adminOverrideAt(): Date | undefined { return this.props.adminOverrideAt }
  get offlineId(): string | undefined { return this.props.offlineId }

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
   * Optionally accepts delivery metadata (photo URL, GPS, visit code).
   *
   * FIX MEDIUM (C-BIZ-5 + C-BIZ-6): El nuevo total se calcula con los
   * subtotalesEntregados. Si un pago previo era > nuevoTotal (parcial
   * después de descuentos), se clipea a nuevoTotal para no violar
   * chk_pedido_montopagado_le_total CHECK constraint.
   */
  entregar(
    entregas: Array<{ producto: ProductCode; cantidad: number }>,
    metadata?: {
      fotoEntrega?: string
      gpsLat?: number
      gpsLng?: number
      gpsAccuracy?: number
      gpsJustificacion?: string
      entregadoConGps?: boolean
      entregadoAt?: Date
      codigoVisita?: string
    },
  ): void {
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

    // FIX C-BIZ-5: Forzar source-of-truth en totalPagado.
    // Si por algún cálculo raro totalPagado > nuevoTotal (overpayment
    // preexistente), clipamos a nuevoTotal. La fórmula canónica es:
    //   total = subtotals de items entregados
    //   totalPagado = min(pagos aplicados, total)
    //   saldo = total - totalPagado
    const nuevoTotalPagadoCents = Math.min(
      this.props.totalPagado.cents,
      nuevoTotal.cents,
    )
    const nuevoTotalPagado = new Money(nuevoTotalPagadoCents)

    this.props = {
      ...this.props,
      estadoEntrega: EstadoEntregaVO.create('ENTREGADO'),
      total: nuevoTotal,
      totalPagado: nuevoTotalPagado,
      estadoPago: EstadoPagoVO.fromTotals(
        nuevoTotal.toDecimal(),
        nuevoTotalPagado.toDecimal(),
      ),
      fotoEntrega: metadata?.fotoEntrega || this.props.fotoEntrega,
      gpsLat: metadata?.gpsLat ?? this.props.gpsLat,
      gpsLng: metadata?.gpsLng ?? this.props.gpsLng,
      gpsAccuracy: metadata?.gpsAccuracy ?? this.props.gpsAccuracy,
      gpsJustificacion: metadata?.gpsJustificacion || this.props.gpsJustificacion,
      entregadoConGps: metadata?.entregadoConGps ?? this.props.entregadoConGps,
      entregadoAt: metadata?.entregadoAt ?? this.props.entregadoAt ?? new Date(),
      codigoVisita: metadata?.codigoVisita || this.props.codigoVisita,
    }
  }

  /**
   * Mark an admin override on the delivery (e.g. admin clears a GPS dispute).
   */
  marcarAdminOverride(nota: string, adminId: string): void {
    this.props = {
      ...this.props,
      adminOverrideNota: nota,
      adminOverrideBy: adminId,
      adminOverrideAt: new Date(),
    }
  }

  /**
   * Register a payment and recalculate payment state.
   *
   * FIX MEDIUM (C-BIZ-6): Rechaza overpayment. Antes, el método aceptaba
   * pagos que hacían totalPagado > total sin validar, lo que producía
   * saldo < 0 (violando chk_pedido_saldo_calc CHECK constraint en runtime).
   *
   * La política es: rechazar el pago si causaría overpayment directo.
   * Para overpayment con saldo a favor, el cliente tiene la opción de
   * usar `saldoFavor` en la creación del pedido (en CrearPedidoUseCase).
   *
   * Si el pago es parcial (nuevoTotalPagado <= total), se acepta.
   * Si igualaría exactamente, también.
   * Si excede, throw — el caller debe normalizar el pago o
   * registrar el excedente como saldoFavor manualmente.
   */
  registrarPago(pago: PagoData): void {
    if (this.props.estadoEntrega.isTerminal()) {
      throw new Error(`No se puede registrar pago en pedido ${this.id.get()} con estado ${this.props.estadoEntrega.get()}`)
    }

    const nuevosPagos = [...this.props.pagos, pago]
    const nuevoTotalPagadoCents = this.props.totalPagado.cents + Math.round(pago.monto * 100)

    // FIX C-BIZ-6: rechazo overpayment
    if (nuevoTotalPagadoCents > this.props.total.cents) {
      throw new Error(
        `Pago de ${pago.monto} excede el saldo del pedido. ` +
        `Total: ${this.props.total.toDecimal()}, ` +
        `Ya pagado: ${this.props.totalPagado.toDecimal()}, ` +
        `Saldo: ${this.saldo.toDecimal()}. ` +
        `Use saldoFavor para overpayments.`
      )
    }

    const nuevoTotalPagado = new Money(nuevoTotalPagadoCents)

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
   * Mark as CANCELADO. Resets totals. Returns cancellation data needed to
   * create a compensating NotaCredito (FIX CRITICAL C-BIZ-1).
   *
   * Previously: this method reset `total` to 0, then `CancelarPedidoUseCase`
   * created the NotaCredito with `monto = updated.total.toDecimal() = 0`.
   * Customers who had paid for a pedido lost their refund silently.
   *
   * Now: we return the original total in the result so the use case can
   * build the NotaCredito with the correct amount.
   */
  cancelar(): { tuvoPagos: boolean; totalOriginal: number } {
    if (!this.puedeCancelar()) {
      throw new Error(`No se puede cancelar pedido ${this.id.get()} en estado ${this.estadoEntrega.get()}`)
    }

    const tuvoPagos = this.props.totalPagado.cents > 0
    const totalOriginal = this.props.total.toDecimal()

    this.props = {
      ...this.props,
      estadoEntrega: EstadoEntregaVO.create('CANCELADO'),
      estadoPago: EstadoPagoVO.create('ANULADO'),
      totalPagado: new Money(0),
      total: new Money(0),
    }

    return { tuvoPagos, totalOriginal }
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
