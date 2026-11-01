/**
 * Aplica una reducción comercial ya autorizada (#451, ADR-REDUCCION-COMERCIAL-001).
 *
 * Corre DENTRO de una transacción abierta por el caller, que ya tiene el lock `PEDIDO`.
 * En un solo paso, con los mismos números en cada documento:
 *   - `PedidoItem.cantPedido/subtotal` y la columna legacy `c…Ped` de la línea;
 *   - `Pedido.total/saldo/estadoPago`;
 *   - `Factura.subtotal/total/saldo/estado` (si no está anulada);
 *   - una `NotaCredito` por `monto` (numeración de la secuencia `nota_credito_numero_seq`);
 *   - la solicitud, marcada APLICADA con el total antes/después y la nota emitida.
 *
 * Cierre diario (`resumirVentasCierre`): una nota sobre un pedido de un día anterior resta
 * de las ventas de hoy; sobre un pedido de hoy NO se resta otra vez, porque el total del
 * pedido ya bajó. Por eso bajar el total y emitir la nota no cuenta la rebaja dos veces.
 */

import type { TransactionClient } from '@/lib/locks'
import { logAudit } from '@/lib/audit'
import { getNextNumero } from '@/lib/sequence'
import { calcularEstadoPago } from '../../domain/services/pagos-calculator.service'
import {
  calcularReduccion,
  pedidoReducible,
  repartirReduccionBotellon,
} from '../../domain/services/reduccion-comercial.service'
import { trasladarExcedenteASaldoFavor } from './saldo-favor-excedente.service'

const num = (v: unknown): number => Number(v ?? 0)
const redondear = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100

interface LegacyPedido {
  cPacaAguaPed: number; cPacaAguaEnt: number
  cPacaHieloPed: number; cPacaHieloEnt: number
  cBolsaAguaPed: number; cBolsaAguaEnt: number
  cBolsaHieloPed: number; cBolsaHieloEnt: number
  cBotellonFabPed: number; cBotellonFabEnt: number
  cBotellonDomPed: number; cBotellonDomEnt: number
}

/** Lo entregado según las columnas legacy, para no reducir por debajo de ello si hubiera deriva. */
export function entregadoLegacy(p: LegacyPedido, producto: string): number {
  switch (producto) {
    case 'PACA_AGUA': return p.cPacaAguaEnt
    case 'PACA_HIELO': return p.cPacaHieloEnt
    case 'BOLSA_AGUA': return p.cBolsaAguaEnt
    case 'BOLSA_HIELO': return p.cBolsaHieloEnt
    case 'BOTELLON': return p.cBotellonFabEnt + p.cBotellonDomEnt
    default: return 0
  }
}

function legacyReducido(p: LegacyPedido, producto: string, reducir: number): Record<string, number> {
  switch (producto) {
    case 'PACA_AGUA': return { cPacaAguaPed: p.cPacaAguaPed - reducir }
    case 'PACA_HIELO': return { cPacaHieloPed: p.cPacaHieloPed - reducir }
    case 'BOLSA_AGUA': return { cBolsaAguaPed: p.cBolsaAguaPed - reducir }
    case 'BOLSA_HIELO': return { cBolsaHieloPed: p.cBolsaHieloPed - reducir }
    case 'BOTELLON': {
      const r = repartirReduccionBotellon(
        { fabPed: p.cBotellonFabPed, fabEnt: p.cBotellonFabEnt, domPed: p.cBotellonDomPed, domEnt: p.cBotellonDomEnt },
        reducir,
      )
      return { cBotellonFabPed: r.fabPed, cBotellonDomPed: r.domPed }
    }
    default: return {}
  }
}

export async function aplicarReduccionComercial(
  tx: TransactionClient,
  input: { reduccionId: string; actorId: string; nota?: string },
): Promise<{ totalAntes: number; totalDespues: number; saldoDespues: number; notaCreditoId: string; excedenteAcreditado: number }> {
  const r = await tx.pedidoReduccionComercial.findUniqueOrThrow({ where: { id: input.reduccionId } })
  const pedido = await tx.pedido.findUnique({
    where: { id: r.pedidoId },
    include: { items: true, factura: true },
  })
  if (!pedido) throw new Error('PEDIDO_NOT_FOUND')
  if (!pedidoReducible(pedido.estadoEntrega, pedido.estado)) {
    throw new Error('PEDIDO_NO_REDUCIBLE: el pedido está cancelado o anulado.')
  }
  const item = pedido.items.find((i) => i.producto === r.producto)
  if (!item) throw new Error('LINEA_NO_ENCONTRADA: el pedido ya no tiene esa línea.')
  if (item.cantPedido !== r.cantPedidoAntes || redondear(num(item.precio)) !== redondear(num(r.precio))) {
    throw new Error('REDUCCION_OBSOLETA: la línea cambió desde que se solicitó. Solicita la reducción de nuevo.')
  }

  const total = num(pedido.total)
  const totalPagado = num(pedido.totalPagado)
  const calculo = calcularReduccion({
    total,
    totalPagado,
    cantPedido: item.cantPedido,
    cantEntrega: Math.max(item.cantEntrega, entregadoLegacy(pedido, r.producto)),
    precio: num(item.precio),
    cantidadReducida: r.cantidadReducida,
    unidadesOtrasLineas: pedido.items.filter((i) => i.id !== item.id).reduce((s, i) => s + i.cantPedido, 0),
  })
  if (calculo.monto !== redondear(num(r.monto))) {
    throw new Error('REDUCCION_OBSOLETA: el monto cambió desde que se solicitó. Solicita la reducción de nuevo.')
  }

  await tx.pedidoItem.update({
    where: { id: item.id },
    data: {
      cantPedido: calculo.cantPedidoNueva,
      subtotal: redondear(num(item.precio) * calculo.cantPedidoNueva),
    },
  })

  const factura = pedido.factura && pedido.factura.estado !== 'ANULADA' ? pedido.factura : null

  // Pagó de más → el excedente pasa al saldo a favor del cliente (#533). Los Pago no se tocan.
  if (calculo.excedente > 0) {
    await trasladarExcedenteASaldoFavor(tx, {
      pedidoId: pedido.id, clienteId: pedido.clienteId, facturaId: factura?.id ?? null,
      origenTipo: 'REDUCCION_COMERCIAL', origenId: r.id, motivo: `Reducción comercial: ${r.motivo}`, actorId: input.actorId,
      excedente: calculo.excedente, totalPagadoAntes: totalPagado, totalPagadoNuevo: calculo.totalPagadoNuevo, saldoResultante: calculo.saldoNuevo,
    })
  }

  await tx.pedido.update({
    where: { id: pedido.id },
    data: {
      ...legacyReducido(pedido, r.producto, r.cantidadReducida),
      total: calculo.totalNuevo,
      totalPagado: calculo.totalPagadoNuevo,
      saldo: calculo.saldoNuevo,
      estadoPago: calcularEstadoPago(calculo.totalNuevo, calculo.totalPagadoNuevo, pedido.estadoEntrega),
    },
  })

  if (factura) {
    const montoPagadoFactura = Math.max(0, redondear(num(factura.montoPagado) - calculo.excedente))
    await tx.factura.update({
      where: { id: factura.id },
      data: {
        subtotal: redondear(num(factura.subtotal) - calculo.monto),
        total: redondear(num(factura.total) - calculo.monto),
        montoPagado: montoPagadoFactura,
        saldo: calculo.saldoNuevo,
        estado: calculo.saldoNuevo <= 0 ? 'PAGADA' : montoPagadoFactura > 0 ? 'PARCIAL' : 'EMITIDA',
      },
    })
  }

  const numeroNota = await getNextNumero(tx, { model: 'notaCredito' })
  const nota = await tx.notaCredito.create({
    data: {
      numero: `NC-${numeroNota.toString().padStart(5, '0')}`,
      pedidoId: pedido.id,
      facturaId: factura?.id ?? null,
      monto: calculo.monto,
      motivo: `REDUCCION_COMERCIAL: ${r.motivo}`,
      creadoPor: input.actorId,
    },
  })

  await tx.pedidoReduccionComercial.update({
    where: { id: r.id },
    data: {
      estado: 'APLICADA',
      resueltoPorId: input.actorId,
      resueltoAt: new Date(),
      notaResolucion: input.nota ?? null,
      totalAntes: total,
      totalDespues: calculo.totalNuevo,
      notaCreditoId: nota.id,
    },
  })

  await logAudit(
    {
      entidad: 'Pedido',
      registroId: pedido.id,
      accion: 'UPDATE',
      datos: {
        reduccionComercial: {
          reduccionId: r.id,
          producto: r.producto,
          cantidadReducida: r.cantidadReducida,
          cantPedidoAntes: r.cantPedidoAntes,
          cantPedidoDespues: calculo.cantPedidoNueva,
          precio: num(r.precio),
          monto: calculo.monto,
          totalAntes: total,
          totalDespues: calculo.totalNuevo,
          excedenteAcreditado: calculo.excedente,
          notaCredito: nota.numero,
          aceptadoPor: r.aceptadoPor,
          medio: r.medio,
          motivo: r.motivo,
          solicitadoPorId: r.solicitadoPorId,
        },
      },
      usuarioId: input.actorId,
    },
    tx,
  )

  return { totalAntes: total, totalDespues: calculo.totalNuevo, saldoDespues: calculo.saldoNuevo, notaCreditoId: nota.id, excedenteAcreditado: calculo.excedente }
}
