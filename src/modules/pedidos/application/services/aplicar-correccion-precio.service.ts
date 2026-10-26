/**
 * Aplica una corrección de precio ya autorizada (ADR-MONETARIO-002 §1, ADR-CIERRE-004).
 *
 * Corre DENTRO de una transacción abierta por el caller, que ya tiene el lock `PEDIDO`.
 * Recalcula en un solo paso: `PedidoItem.precio/subtotal`, las columnas legacy de precio,
 * `Pedido.total/saldo/estadoPago` y `Factura.total/subtotal/saldo/estado`, y marca la
 * solicitud como APLICADA con el total antes/después.
 *
 * No emite `NotaCredito`: el cierre diario resta las notas de crédito de las ventas
 * (`/api/cierre`: totalVentas = Σ total − Σ NC), así que bajar el total Y emitir una NC
 * por lo mismo contaría la rebaja dos veces. La traza queda en la propia solicitud y en
 * la auditoría.
 */

import type { TransactionClient } from '@/lib/locks'
import { logAudit } from '@/lib/audit'
import { calcularEstadoPago } from '../../domain/services/pagos-calculator.service'
import { calcularCorreccion, pedidoCorregible } from '../../domain/services/correccion-precio.service'

const num = (v: unknown): number => Number(v ?? 0)

export async function aplicarCorreccionPrecio(
  tx: TransactionClient,
  input: { correccionId: string; actorId: string; nota?: string },
): Promise<{ totalAntes: number; totalDespues: number; saldoDespues: number }> {
  const c = await tx.pedidoCorreccionPrecio.findUniqueOrThrow({ where: { id: input.correccionId } })
  const pedido = await tx.pedido.findUnique({
    where: { id: c.pedidoId },
    include: { items: true, factura: true },
  })
  if (!pedido) throw new Error('PEDIDO_NOT_FOUND')
  if (!pedidoCorregible(pedido.estadoEntrega, pedido.estado)) {
    throw new Error('PEDIDO_NO_CORREGIBLE: el pedido está cancelado o anulado.')
  }
  const item = pedido.items.find((i) => i.producto === c.producto)
  if (!item) throw new Error('LINEA_NO_ENCONTRADA: el pedido ya no tiene esa línea.')
  if (num(item.precio) !== num(c.precioAnterior)) {
    throw new Error('CORRECCION_OBSOLETA: el precio de la línea cambió desde que se solicitó. Solicita la corrección de nuevo.')
  }

  const total = num(pedido.total)
  const totalPagado = num(pedido.totalPagado)
  const r = calcularCorreccion({
    total,
    totalPagado,
    cantidad: item.cantPedido,
    precioAnterior: num(item.precio),
    precioNuevo: num(c.precioNuevo),
  })

  await tx.pedidoItem.update({
    where: { id: item.id },
    data: {
      precio: num(c.precioNuevo),
      subtotal: Math.round(num(c.precioNuevo) * item.cantPedido * 100) / 100,
      precioOrigen: 'manual',
      autorizadoPorAdmin: true,
      autorizadoPorId: input.actorId,
      autorizadoEn: new Date(),
    },
  })

  const precioNuevo = num(c.precioNuevo)
  const legacy: Record<string, number> = {}
  switch (c.producto) {
    case 'PACA_AGUA': legacy.precioPacaAgua = precioNuevo; break
    case 'PACA_HIELO': legacy.precioPacaHielo = precioNuevo; break
    case 'BOLSA_AGUA': legacy.precioBolsaAgua = precioNuevo; break
    case 'BOLSA_HIELO': legacy.precioBolsaHielo = precioNuevo; break
    case 'BOTELLON':
      if (pedido.cBotellonFabPed > 0) legacy.precioBotellonFab = precioNuevo
      if (pedido.cBotellonDomPed > 0 || pedido.cBotellonFabPed === 0) legacy.precioBotellonDom = precioNuevo
      break
    default: break
  }

  await tx.pedido.update({
    where: { id: pedido.id },
    data: {
      ...legacy,
      total: r.totalNuevo,
      saldo: r.saldoNuevo,
      estadoPago: calcularEstadoPago(r.totalNuevo, totalPagado, pedido.estadoEntrega),
    },
  })

  if (pedido.factura && pedido.factura.estado !== 'ANULADA') {
    await tx.factura.update({
      where: { id: pedido.factura.id },
      data: {
        subtotal: Math.round((num(pedido.factura.subtotal) + r.delta) * 100) / 100,
        total: Math.round((num(pedido.factura.total) + r.delta) * 100) / 100,
        saldo: r.saldoNuevo,
        estado: r.saldoNuevo <= 0 ? 'PAGADA' : num(pedido.factura.montoPagado) > 0 ? 'PARCIAL' : 'EMITIDA',
      },
    })
  }

  await tx.pedidoCorreccionPrecio.update({
    where: { id: c.id },
    data: {
      estado: 'APLICADA',
      resueltoPorId: input.actorId,
      resueltoAt: new Date(),
      notaResolucion: input.nota ?? null,
      totalAntes: total,
      totalDespues: r.totalNuevo,
    },
  })

  await logAudit(
    {
      entidad: 'Pedido',
      registroId: pedido.id,
      accion: 'UPDATE',
      datos: {
        correccionPrecio: {
          correccionId: c.id,
          producto: c.producto,
          precioAnterior: num(c.precioAnterior),
          precioNuevo,
          cantidad: item.cantPedido,
          totalAntes: total,
          totalDespues: r.totalNuevo,
          motivo: c.motivo,
          precioRaro: c.precioRaro,
          solicitadoPorId: c.solicitadoPorId,
        },
      },
      usuarioId: input.actorId,
    },
    tx,
  )

  return { totalAntes: total, totalDespues: r.totalNuevo, saldoDespues: r.saldoNuevo }
}
