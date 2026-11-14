import type { Prisma } from '@prisma/client'
import { isConsumidorFinalCanonical } from '@/lib/cliente-canonical'
import { logAudit } from '@/lib/audit'

/**
 * #772 — misma autoridad para gastar BONO en pagar-fiado y abonos independientes.
 * BONO consume saldo a favor recibido antes; NO representa dinero ingresado hoy.
 *
 * Ejecutar solo dentro de la transacción ya protegida por CARTERA y después del
 * check de idempotencia. Si ocurre un error tras escribir, el caller debe lanzar
 * para revertir toda la transacción, nunca devolver un HTTP 4xx post-escritura.
 */
export class BonoSaldoFavorError extends Error {
  constructor(
    readonly code: 'SALDO_FAVOR_INSUFICIENTE' | 'BONO_SIN_CLIENTE',
    readonly status: 409 | 422,
    message: string,
  ) {
    super(message)
  }
}

export async function consumirBonoDeSaldoFavor(
  tx: Pick<Prisma.TransactionClient, 'cliente'>,
  clienteId: string,
  monto: number,
): Promise<void> {
  const centavos = Math.round(monto * 100)
  if (!Number.isSafeInteger(centavos) || centavos <= 0 || Math.abs(centavos - monto * 100) > 0.000001) {
    throw new Error('MONTO_BONO_INVALIDO')
  }
  if (isConsumidorFinalCanonical(clienteId)) {
    throw new BonoSaldoFavorError('BONO_SIN_CLIENTE', 422, 'Las ventas sin cliente no admiten saldo a favor.')
  }
  const consumido = await tx.cliente.updateMany({
    where: { id: clienteId, saldoFavor: { gte: centavos / 100 } },
    data: { saldoFavor: { decrement: centavos / 100 } },
  })
  if (consumido.count !== 1) {
    throw new BonoSaldoFavorError(
      'SALDO_FAVOR_INSUFICIENTE',
      409,
      'No hay saldo a favor suficiente para utilizar ese BONO.',
    )
  }
}

/** ID estable para vincular un BONO debitado con su Abono y futuras correcciones. */
export const idConsumoBonoAbono = (abonoId: string): string => `bono-abono:${abonoId}`

/** Evidencia propia de nuevos movimientos; los Abonos BONO históricos no se presumen debitados. */
export const OPERACION_CONSUMO_BONO = 'CONSUMO_BONO_SALDO_FAVOR'

type LectorBono = Pick<Prisma.TransactionClient, 'historial'>

/** Comprueba el débito previo de crédito sin atribuirlo a Abonos BONO legados. */
export async function verificarConsumoBonoAbono(
  tx: LectorBono,
  abono: { id: string; clienteId: string; metodoPago: string; monto: unknown },
): Promise<boolean> {
  if (abono.metodoPago !== 'BONO') return false
  const registro = await tx.historial.findUnique({
    where: { id: idConsumoBonoAbono(abono.id) },
    select: { entidad: true, registroId: true, datos: true },
  })
  if (!registro) return false // histórico: no prueba descuento real
  let raw: unknown
  try { raw = JSON.parse(registro.datos) as unknown } catch { throw new Error('BONO_AUDITORIA_INVALIDA') }
  if (!raw || typeof raw !== 'object') throw new Error('BONO_AUDITORIA_INVALIDA')
  const datos = raw as Record<string, unknown>
  if (registro.entidad !== 'Abono' || registro.registroId !== abono.id ||
    datos.operacion !== OPERACION_CONSUMO_BONO || datos.clienteId !== abono.clienteId ||
    datos.metodo !== 'BONO' || Number(datos.monto) !== Number(abono.monto)) {
    throw new Error('BONO_AUDITORIA_INVALIDA')
  }
  return true
}

/**
 * #772: al anular/cancelar, retornar al cliente el BONO que se consumió en
 * esa deuda y aún no fue restituido por una CorreccionAbono.
 *
 * Se invoca DESPUÉS de revertir el crédito generado por el propio pedido
 * (#533/#577), para no extinguir el BONO devuelto por la cancelación.
 * El caller serializa las anulaciones y verifica el estado terminal.
 */
export async function restituirBonoPedidoAnulado(
  tx: Pick<Prisma.TransactionClient, 'abono' | 'historial' | 'cliente'>,
  pedidoId: string,
  clienteId: string,
): Promise<number> {
  const abonos = await tx.abono.findMany({
    where: { pedidoId, clienteId, metodoPago: 'BONO' },
    select: {
      id: true, clienteId: true, monto: true, metodoPago: true,
      correcciones: { select: { montoRevertido: true } },
    },
  })
  let centavos = 0
  for (const a of abonos) {
    if (!(await verificarConsumoBonoAbono(tx, a))) continue
    const total = Math.round(Number(a.monto) * 100)
    const revertido = a.correcciones.reduce((suma, c) => suma + Math.round(Number(c.montoRevertido) * 100), 0)
    if (!Number.isSafeInteger(total) || !Number.isSafeInteger(revertido) ||
      revertido < 0 || revertido > total) throw new Error('BONO_CORRECCION_INVALIDA')
    centavos += total - revertido
  }
  if (!centavos) return 0
  if (!Number.isSafeInteger(centavos)) throw new Error('BONO_MONTO_INVALIDO')
  const monto = centavos / 100
  await tx.cliente.update({
    where: { id: clienteId },
    data: { saldoFavor: { increment: monto } },
  })
  await logAudit({
    id: `bono-pedido-anulado:${pedidoId}`, entidad: 'Pedido', registroId: pedidoId,
    accion: 'UPDATE', datos: { operacion: 'RESTITUCION_BONO_ANULACION', clienteId, monto },
  }, tx)
  return monto
}
