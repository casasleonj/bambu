import type { Prisma } from '@prisma/client'
import { isConsumidorFinalCanonical } from '@/lib/cliente-canonical'

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
