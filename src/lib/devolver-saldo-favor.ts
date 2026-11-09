import { Prisma } from '@prisma/client'
import { logAudit } from '@/lib/audit'
import { isConsumidorFinalCanonical } from '@/lib/cliente-canonical'

/**
 * #560 — Devolver al cliente su saldo a favor.
 *
 * Es una salida de dinero: solo la autoriza un ADMIN (decisión del PO, 2026-11-02). El monto no puede pasar del
 * saldo disponible, baja `Cliente.saldoFavor` y queda en `DevolucionSaldoFavor` (append-only) más la auditoría.
 * Solo la devolución en EFECTIVO resta de la caja del cierre de la fecha de registro (ver `resumirAbonosDelDia`);
 * no reabre cierres anteriores. Idempotente por `offlineId`: el reintento responde lo ya hecho.
 *
 * El llamador abre la transacción y toma el lock `CARTERA` del cliente (el mismo de los cobros) antes de llamar.
 */

export const METODOS_DEVOLUCION = ['EFECTIVO', 'TRANSFERENCIA', 'NEQUI', 'DAVIPLATA'] as const
export type MetodoDevolucion = (typeof METODOS_DEVOLUCION)[number]

export type TxDevolucion = Pick<Prisma.TransactionClient, 'cliente' | 'devolucionSaldoFavor' | 'historial'>

export interface EntradaDevolucion {
  clienteId: string
  monto: number
  metodo: MetodoDevolucion
  motivo: string
  offlineId: string
  autorizadoPorId: string
}

export type ResultadoDevolucion =
  | { ok: true; deduped: boolean; devolucionId: string; monto: number; metodo: string; saldoRestante: number }
  | { ok: false; codigo: 'CLIENTE_NO_ENCONTRADO' | 'CLIENTE_ANONIMO' | 'MONTO_INVALIDO' | 'SALDO_INSUFICIENTE' | 'OFFLINE_ID_DE_OTRO_CLIENTE'; mensaje: string; saldo?: number }

const aCentavos = (n: number) => Math.round(n * 100)

export async function devolverSaldoFavor(tx: TxDevolucion, e: EntradaDevolucion): Promise<ResultadoDevolucion> {
  const centavos = aCentavos(e.monto)
  if (!Number.isFinite(e.monto) || centavos <= 0) {
    return { ok: false, codigo: 'MONTO_INVALIDO', mensaje: 'El monto a devolver debe ser mayor que cero.' }
  }
  if (isConsumidorFinalCanonical(e.clienteId)) {
    return { ok: false, codigo: 'CLIENTE_ANONIMO', mensaje: 'La venta anónima no tiene saldo a favor que devolver.' }
  }

  const cliente = await tx.cliente.findUnique({ where: { id: e.clienteId }, select: { id: true, saldoFavor: true } })
  if (!cliente) return { ok: false, codigo: 'CLIENTE_NO_ENCONTRADO', mensaje: 'Cliente no encontrado.' }

  // Reintento: lo ya devuelto con esta referencia no se repite.
  const previa = await tx.devolucionSaldoFavor.findUnique({ where: { offlineId: e.offlineId } })
  if (previa) {
    if (previa.clienteId !== e.clienteId) {
      return { ok: false, codigo: 'OFFLINE_ID_DE_OTRO_CLIENTE', mensaje: 'Esa referencia ya se usó en otra devolución.' }
    }
    return { ok: true, deduped: true, devolucionId: previa.id, monto: Number(previa.monto), metodo: previa.metodo, saldoRestante: Number(cliente.saldoFavor) }
  }

  const saldo = aCentavos(Number(cliente.saldoFavor))
  if (centavos > saldo) {
    return { ok: false, codigo: 'SALDO_INSUFICIENTE', mensaje: 'El monto supera el saldo a favor disponible.', saldo: saldo / 100 }
  }

  const monto = centavos / 100
  // Baja condicionada al saldo: si algo lo gastó entre la lectura y aquí, no queda negativo.
  const baja = await tx.cliente.updateMany({
    where: { id: e.clienteId, saldoFavor: { gte: monto } },
    data: { saldoFavor: { decrement: monto } },
  })
  if (baja.count !== 1) {
    return { ok: false, codigo: 'SALDO_INSUFICIENTE', mensaje: 'El monto supera el saldo a favor disponible.', saldo: saldo / 100 }
  }
  const creada = await tx.devolucionSaldoFavor.create({
    data: { clienteId: e.clienteId, metodo: e.metodo, monto, motivo: e.motivo, offlineId: e.offlineId, autorizadoPorId: e.autorizadoPorId },
  })
  const saldoRestante = (saldo - centavos) / 100
  await logAudit(
    {
      entidad: 'Cliente',
      registroId: e.clienteId,
      accion: 'UPDATE',
      usuarioId: e.autorizadoPorId,
      datos: { operacion: 'DEVOLUCION_SALDO_FAVOR', devolucionId: creada.id, monto, metodo: e.metodo, motivo: e.motivo, saldoAntes: saldo / 100, saldoDespues: saldoRestante, offlineId: e.offlineId },
    },
    tx,
  )
  return { ok: true, deduped: false, devolucionId: creada.id, monto, metodo: e.metodo, saldoRestante }
}
