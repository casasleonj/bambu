import type { Prisma } from '@prisma/client'

/**
 * ¿Ya existe una nómina (no anulada) del trabajador que cubra esa fecha?
 *
 * Usa la MISMA comparación que `POST /api/nomina`: la nómina guarda
 * `fechaInicio` y `fechaFin` (fin de día UTC) y se solapa por
 * `fechaInicio <= x && fechaFin >= x`. Una entrega registrada en una fecha
 * cubierta nunca se liquidaría, así que la gestión temporal sin embarque la
 * rechaza (#472). La comisión de la nómina debe leer su rango con los mismos
 * límites para que no haya un borde donde una entrega pase el rechazo y luego
 * no pague.
 */
export async function nominaQueCubre(
  tx: Pick<Prisma.TransactionClient, 'nomina'>,
  trabajadorId: string,
  fecha: Date,
): Promise<{ id: string; fechaInicio: Date; fechaFin: Date } | null> {
  return tx.nomina.findFirst({
    where: {
      trabajadorId,
      estado: { not: 'ANULADA' },
      fechaInicio: { lte: fecha },
      fechaFin: { gte: fecha },
    },
    select: { id: true, fechaInicio: true, fechaFin: true },
  })
}
