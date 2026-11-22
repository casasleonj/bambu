/**
 * #630 F0: barrera de versión Producción ↔ Cierre.
 *
 * El advisory lock por fecha serializa las escrituras, pero NO garantiza que
 * Serializable vea una producción confirmada mientras aguardaba ese lock:
 * el SELECT del advisory lock puede fijar un snapshot anterior.
 *
 * Todas las altas/correcciones de producción actualizan la misma fila Config.
 * Cierre la actualiza inmediatamente después de su lock y antes de leer datos.
 * Si un productor la modificó desde el snapshot del Cierre, PostgreSQL genera
 * una serialization failure (P2034), permitiendo que el retry existente del
 * Cierre obtenga un snapshot reciente. No cambiar Serializable a ReadCommitted.
 *
 * La fila es un token técnico de sincronización, NO un stock ni una métrica.
 * No migración ni escrituras fuera de la transacción original.
 */
import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'

export async function marcarVersionProduccionCierre(
  tx: Prisma.TransactionClient,
  inicioDiaBogota: Date,
): Promise<void> {
  const clave = `PRODUCCION_CIERRE_VERSION_${inicioDiaBogota.toISOString().slice(0, 10)}`
  const valor = randomUUID()
  await tx.config.upsert({
    where: { clave },
    create: { clave, valor },
    update: { valor },
  })
}
