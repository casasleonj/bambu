/**
 * Excedente de una corrección de precio o reducción comercial → saldo a favor
 * (#533, ADR-SALDO-FAVOR-EXCEDENTE-001).
 *
 * Cuando el nuevo total queda por debajo de lo ya pagado, el pedido queda pagado por su nuevo
 * total y la diferencia pasa al saldo a favor del cliente. Es una reclasificación: los `Pago`
 * no se tocan y no se mueve caja (el dinero ya entró y sigue en la empresa, ahora como crédito).
 * Si después el total vuelve a subir, se reaplica el crédito que salió de ESTE pedido, hasta lo
 * que el cliente todavía tenga disponible.
 *
 * Corre DENTRO de la transacción del caller (que ya tiene el lock `PEDIDO`). El saldo del
 * cliente solo se mueve con operaciones atómicas en la base (incremento, o decremento
 * condicionado a que alcance), así que no necesita el lock `CARTERA` ni puede dejar un saldo
 * negativo si el cliente lo gasta al mismo tiempo en otro pedido.
 */

import type { TransactionClient } from '@/lib/locks'
import { isConsumidorFinalCanonical } from '@/lib/cliente-canonical'
import { registrarReceivableEntry } from '@/lib/receivable-entry'

export type OrigenExcedente = 'CORRECCION_PRECIO' | 'REDUCCION_COMERCIAL'

const num = (v: unknown): number => Number(v ?? 0)
const aCentavos = (n: number): number => Math.round((n + Number.EPSILON) * 100)
const deCentavos = (c: number): number => c / 100

interface ContextoMovimiento {
  pedidoId: string
  clienteId: string
  facturaId: string | null
  origenTipo: OrigenExcedente
  origenId: string
  motivo: string
  actorId: string
}

/**
 * Lo que respalda un crédito: lo pagado menos los pagos aún sin confirmar (`REPORTADO` o
 * `DISCREPANTE`). Acreditar saldo a favor con un pago que nadie confirmó permitiría gastar dinero
 * que quizá nunca llegó.
 */
export async function respaldoConfirmado(tx: TransactionClient, pedidoId: string, totalPagado: number): Promise<number> {
  const sinConfirmar = await tx.pago.aggregate({
    where: { pedidoId, confirmacion: { not: 'CONFIRMADO' } },
    _sum: { monto: true },
  })
  return Math.max(0, deCentavos(aCentavos(totalPagado) - aCentavos(num(sinConfirmar._sum.monto))))
}

/**
 * Crédito que salió de este pedido y sigue pendiente: Σ ACREDITACION − Σ REAPLICACION − Σ REVERSION_ANULACION.
 * En un pedido ya anulado o cancelado lo que queda es lo que el cliente alcanzó a usar en otros pedidos
 * antes de la anulación (no se pudo restar).
 */
export async function creditoNetoDelPedido(tx: TransactionClient, pedidoId: string): Promise<number> {
  const filas = await tx.pedidoSaldoFavorMovimiento.groupBy({
    by: ['tipo'],
    where: { pedidoId },
    _sum: { monto: true },
  })
  const suma = (t: string) => aCentavos(num(filas.find((f) => f.tipo === t)?._sum.monto))
  return deCentavos(Math.max(0, suma('ACREDITACION') - suma('REAPLICACION') - suma('REVERSION_ANULACION')))
}

export interface ProyeccionReversionCredito {
  /** Crédito que salió de este pedido y sigue pendiente. */
  salioDelPedido: number
  /** Lo que se puede restar ahora: lo pendiente, acotado a lo que el cliente tiene disponible. */
  seResta: number
  /** Lo pendiente que el cliente ya usó en otros pedidos y no se puede restar. */
  yaUsado: number
  saldoActual: number
  saldoDespues: number
}

/** Qué pasaría con el saldo a favor si se anulara o cancelara el pedido ahora. Solo lee. */
export async function proyectarReversionCredito(tx: TransactionClient, pedidoId: string, clienteId: string): Promise<ProyeccionReversionCredito> {
  const neto = isConsumidorFinalCanonical(clienteId) ? 0 : await creditoNetoDelPedido(tx, pedidoId)
  const cli = await tx.cliente.findUnique({ where: { id: clienteId }, select: { saldoFavor: true } })
  const saldoActual = num(cli?.saldoFavor)
  const seRestaC = Math.min(aCentavos(neto), aCentavos(saldoActual))
  return {
    salioDelPedido: neto,
    seResta: deCentavos(seRestaC),
    yaUsado: deCentavos(aCentavos(neto) - seRestaC),
    saldoActual,
    saldoDespues: deCentavos(aCentavos(saldoActual) - seRestaC),
  }
}

/**
 * Anular o cancelar el pedido resta del saldo a favor del cliente lo que salió de él (#577). Es lo
 * que el cliente todavía tiene: si ya gastó una parte en otros pedidos, esa parte no se toca (esos
 * pedidos quedaron pagados de verdad) y se informa como `yaUsado`. Mismo patrón atómico que
 * `reaplicarCreditoDelPedido`: decremento condicionado, con reintento si el saldo cambió.
 */
export async function revertirCreditoDelPedido(
  tx: TransactionClient,
  input: { pedidoId: string; clienteId: string; origen: 'ANULACION' | 'CANCELACION'; motivo: string; actorId: string },
): Promise<{ revertido: number; yaUsado: number }> {
  if (isConsumidorFinalCanonical(input.clienteId)) return { revertido: 0, yaUsado: 0 }
  const neto = await creditoNetoDelPedido(tx, input.pedidoId)
  if (neto <= 0) return { revertido: 0, yaUsado: 0 }
  if (!input.actorId) throw new Error('ACTOR_REQUERIDO: el pedido tiene saldo a favor que restar y falta indicar quién lo anula.')

  for (let intento = 0; intento < 3; intento++) {
    const cli = await tx.cliente.findUnique({ where: { id: input.clienteId }, select: { saldoFavor: true } })
    const aRestarC = Math.min(aCentavos(neto), aCentavos(num(cli?.saldoFavor)))
    if (aRestarC <= 0) return { revertido: 0, yaUsado: neto }
    const monto = deCentavos(aRestarC)
    const r = await tx.cliente.updateMany({
      where: { id: input.clienteId, saldoFavor: { gte: monto } },
      data: { saldoFavor: { decrement: monto } },
    })
    if (r.count === 0) continue // el saldo cambió entre la lectura y la escritura: reintenta con el valor fresco
    await tx.pedidoSaldoFavorMovimiento.create({
      data: {
        pedidoId: input.pedidoId, clienteId: input.clienteId, tipo: 'REVERSION_ANULACION', monto,
        origenTipo: input.origen, origenId: input.pedidoId, motivo: input.motivo, autorId: input.actorId,
      },
    })
    return { revertido: monto, yaUsado: deCentavos(aCentavos(neto) - aRestarC) }
  }
  // No se pudo fijar el saldo tras los reintentos: se informa todo como no revertido en vez de fallar la anulación.
  return { revertido: 0, yaUsado: neto }
}

/**
 * Comprueba que un excedente se pueda acreditar. Se usa al solicitar (para no encolar lo que no se
 * podrá aplicar) y otra vez al aplicar, con los datos de ese momento. Errores (`CODIGO: texto`):
 *  - `EXCEDENTE_SIN_CLIENTE`: la venta anónima no tiene a quién acreditar.
 *  - `EXCEDENTE_SIN_CONFIRMAR`: el excedente supera lo respaldado por pagos confirmados.
 */
export async function validarExcedenteAcreditable(
  tx: TransactionClient,
  input: { pedidoId: string; clienteId: string; excedente: number; totalPagadoAntes: number },
): Promise<void> {
  if (input.excedente <= 0) return
  if (isConsumidorFinalCanonical(input.clienteId)) {
    throw new Error(
      'EXCEDENTE_SIN_CLIENTE: la venta es a un cliente anónimo y no hay a quién acreditar lo pagado de más. Devuelve el excedente en efectivo.',
    )
  }
  const respaldo = await respaldoConfirmado(tx, input.pedidoId, input.totalPagadoAntes)
  if (aCentavos(input.excedente) > aCentavos(respaldo)) {
    throw new Error(
      `EXCEDENTE_SIN_CONFIRMAR: el excedente es ${input.excedente} y solo hay ${respaldo} respaldado por pagos confirmados. Confirma los pagos digitales antes de acreditar.`,
    )
  }
}

/** Valida y registra el traslado. El caller actualiza `Pedido`/`Factura` con `totalPagadoNuevo`. */
export async function trasladarExcedenteASaldoFavor(
  tx: TransactionClient,
  input: ContextoMovimiento & { excedente: number; totalPagadoAntes: number; totalPagadoNuevo: number; saldoResultante: number },
): Promise<void> {
  if (input.excedente <= 0) return
  await validarExcedenteAcreditable(tx, input)

  await tx.cliente.update({ where: { id: input.clienteId }, data: { saldoFavor: { increment: input.excedente } } })
  await tx.pedidoSaldoFavorMovimiento.create({
    data: {
      pedidoId: input.pedidoId, clienteId: input.clienteId, tipo: 'ACREDITACION', monto: input.excedente,
      origenTipo: input.origenTipo, origenId: input.origenId, motivo: input.motivo, autorId: input.actorId,
    },
  })
  // Proyección de auditoría: compensa lo pagado que ya no corresponde al pedido (REVERSION).
  await registrarReceivableEntry(tx, {
    pedidoId: input.pedidoId, facturaId: input.facturaId, clienteId: input.clienteId, tipo: 'REVERSION',
    monto: input.excedente, saldoResultante: input.saldoResultante, totalPagadoResultante: input.totalPagadoNuevo,
  })
}

/**
 * Reaplica al pedido el crédito que salió de él, hasta `faltante`, hasta lo que quede sin
 * reaplicar de este pedido y hasta lo que el cliente tenga disponible AHORA. Devuelve lo
 * reaplicado (0 si no corresponde). El decremento es atómico y condicionado: si el cliente gastó
 * el crédito en otro pedido, no se reaplica lo que ya no está y el resto queda como saldo real.
 */
export async function reaplicarCreditoDelPedido(
  tx: TransactionClient,
  input: ContextoMovimiento & { faltante: number; totalPagadoAntes: number; saldoResultanteFn: (reaplicado: number) => number },
): Promise<number> {
  if (input.faltante <= 0 || isConsumidorFinalCanonical(input.clienteId)) return 0
  const neto = await creditoNetoDelPedido(tx, input.pedidoId)
  if (neto <= 0) return 0

  for (let intento = 0; intento < 3; intento++) {
    const cli = await tx.cliente.findUnique({ where: { id: input.clienteId }, select: { saldoFavor: true } })
    const disponible = num(cli?.saldoFavor)
    const aplicarC = Math.min(aCentavos(input.faltante), aCentavos(neto), aCentavos(disponible))
    if (aplicarC <= 0) return 0
    const monto = deCentavos(aplicarC)
    const r = await tx.cliente.updateMany({
      where: { id: input.clienteId, saldoFavor: { gte: monto } },
      data: { saldoFavor: { decrement: monto } },
    })
    if (r.count === 0) continue // el saldo cambió entre la lectura y la escritura: reintenta con el valor fresco
    await tx.pedidoSaldoFavorMovimiento.create({
      data: {
        pedidoId: input.pedidoId, clienteId: input.clienteId, tipo: 'REAPLICACION', monto,
        origenTipo: input.origenTipo, origenId: input.origenId, motivo: input.motivo, autorId: input.actorId,
      },
    })
    const totalPagadoNuevo = deCentavos(aCentavos(input.totalPagadoAntes) + aplicarC)
    await registrarReceivableEntry(tx, {
      pedidoId: input.pedidoId, facturaId: input.facturaId, clienteId: input.clienteId, tipo: 'PAGO',
      monto, saldoResultante: input.saldoResultanteFn(monto), totalPagadoResultante: totalPagadoNuevo,
    })
    return monto
  }
  return 0
}
