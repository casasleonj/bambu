import type { Prisma } from '@prisma/client'
import { dayInBogota, startOfDayInBogota } from './date-helpers'

/** Solo cierres realmente registrados dentro de su propia jornada. */
export async function leerCierresOperativos(
  db: Pick<Prisma.TransactionClient, 'cierreDia'>,
  dias: readonly string[],
): Promise<Map<string, Date>> {
  const fechas = [...new Set(dias)].map(startOfDayInBogota)
  if (!fechas.length) return new Map()
  const filas = await db.cierreDia.findMany({
    where: { fecha: { in: fechas } },
    select: { fecha: true, horaCierre: true },
  })
  const resultado = new Map<string, Date>()
  for (const fila of filas) {
    const dia = dayInBogota(fila.fecha)
    if (fila.horaCierre && dayInBogota(fila.horaCierre) === dia) {
      resultado.set(dia, fila.horaCierre)
    }
  }
  return resultado
}
