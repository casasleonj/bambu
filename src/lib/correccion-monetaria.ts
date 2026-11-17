// #796 / ADR-CORRECCION-MONETARIA-001 y -002 — Efecto de una reversión monetaria sobre Factura y Pedido.
// Lo comparten la corrección de un Abono y la de un Pago sin abono, para que haya UN solo cálculo (no dos).
// Append-only: no edita ni borra ningún Abono ni Pago; solo recalcula las proyecciones y deja la `ReceivableEntry REVERSION`.
import type { Prisma } from '@prisma/client'
import { calcularEstadoPago } from '@/lib/pedido-utils'
import { registrarReceivableEntry } from '@/lib/receivable-entry'

export interface PedidoParaReversion {
  id: string
  total: unknown
  totalPagado: unknown
  saldo: unknown
  estadoEntrega: string
  estadoPago: string
}

export interface FacturaParaReversion {
  id: string
  total: unknown
  montoPagado: unknown
  saldo: unknown
  estado: string
}

/** Valores anteriores y posteriores de lo que cambia (condición 3 del PO: trazabilidad completa). */
export interface EfectoReversion {
  pedido: { antes: { totalPagado: number; saldo: number; estadoPago: string }; despues: { totalPagado: number; saldo: number; estadoPago: string } } | null
  factura: { antes: { montoPagado: number; saldo: number; estado: string }; despues: { montoPagado: number; saldo: number; estado: string } } | null
}

export async function aplicarReversionMonetaria(
  tx: Prisma.TransactionClient,
  args: {
    pedido: PedidoParaReversion | null
    factura: FacturaParaReversion | null
    clienteId: string
    revertir: number
    correccionOfflineId: string | null
  },
): Promise<{ efecto: EfectoReversion; pedidoActualizado: unknown; facturaActualizada: unknown }> {
  const { pedido, factura, clienteId, revertir, correccionOfflineId } = args
  const efecto: EfectoReversion = { pedido: null, factura: null }

  // Factura: la reversión devuelve saldo y quita monto pagado (clamp a >= 0, paridad con `calcularSaldo`).
  let facturaActualizada: unknown = null
  if (factura) {
    const nuevoMontoPagado = Math.max(0, Number(factura.montoPagado) - revertir)
    const nuevoSaldoFactura = Math.max(0, Number(factura.total) - nuevoMontoPagado)
    const nuevoEstadoFactura = nuevoSaldoFactura <= 0 ? 'PAGADA' : nuevoMontoPagado > 0 ? 'PARCIAL' : 'EMITIDA'
    facturaActualizada = await tx.factura.update({
      where: { id: factura.id },
      data: { montoPagado: nuevoMontoPagado, saldo: nuevoSaldoFactura, estado: nuevoEstadoFactura },
    })
    efecto.factura = {
      antes: { montoPagado: Number(factura.montoPagado), saldo: Number(factura.saldo), estado: factura.estado },
      despues: { montoPagado: nuevoMontoPagado, saldo: nuevoSaldoFactura, estado: nuevoEstadoFactura },
    }
  }

  // Pedido + proyección de auditoría (ADR-MONETARIO-001 §12), en la MISMA transacción.
  let pedidoActualizado: unknown = null
  if (pedido) {
    const nuevoTotalPagado = Math.max(0, Number(pedido.totalPagado) - revertir)
    const nuevoSaldoPedido = Math.max(0, Number(pedido.total) - nuevoTotalPagado)
    const nuevoEstadoPago = calcularEstadoPago(Number(pedido.total), nuevoTotalPagado, pedido.estadoEntrega)
    pedidoActualizado = await tx.pedido.update({
      where: { id: pedido.id },
      data: { totalPagado: nuevoTotalPagado, saldo: nuevoSaldoPedido, estadoPago: nuevoEstadoPago },
    })
    await registrarReceivableEntry(tx, {
      pedidoId: pedido.id,
      facturaId: factura?.id ?? null,
      clienteId,
      tipo: 'REVERSION',
      monto: revertir,
      saldoResultante: nuevoSaldoPedido,
      totalPagadoResultante: nuevoTotalPagado,
      offlineId: correccionOfflineId,
    })
    efecto.pedido = {
      antes: { totalPagado: Number(pedido.totalPagado), saldo: Number(pedido.saldo), estadoPago: pedido.estadoPago },
      despues: { totalPagado: nuevoTotalPagado, saldo: nuevoSaldoPedido, estadoPago: nuevoEstadoPago },
    }
  }
  return { efecto, pedidoActualizado, facturaActualizada }
}
