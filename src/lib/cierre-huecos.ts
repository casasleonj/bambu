import type { Prisma } from '@prisma/client'
import { dayInBogota, startOfDayInBogota } from '@/lib/date-helpers'

/**
 * #306 (decisión del PO, 2026-11-02): entre el último cierre y el día que se quiere cerrar
 * pueden quedar días sin cerrar («hueco»).
 *
 * - Un día SIN operación (domingo, festivo, día sin ventas) se salta solo.
 * - Un día CON operación bloquea el cierre y NADIE puede saltarlo: su dinero y su stock quedarían fuera de
 *   la contabilidad (regla del PO, 2026-11-03).
 * - Un día omitido (sin operación) se puede cerrar después, aunque ya haya un cierre posterior.
 *
 * Operación = cualquier registro con fecha dentro del día de Bogotá: pedidos, pagos capturados,
 * gastos, embarques, producción, descuentos al repartidor, notas crédito o facturas.
 */

const DIA_MS = 86_400_000
/** Tope de días revisados hacia atrás desde el día que se consulta. */
export const MAX_DIAS_HUECO = 45

export interface DiaHueco {
  /** YYYY-MM-DD (Bogotá) */
  fecha: string
  /** Cantidad de registros con operación ese día (0 = día sin operación). */
  operaciones: number
}

/** Operaciones por día de Bogotá (YYYY-MM-DD) en [desde, hasta): una sola consulta para todo el rango. */
async function contarOperacionesPorDia(tx: Prisma.TransactionClient, desde: Date, hasta: Date): Promise<Map<string, number>> {
  const filas = await tx.$queryRaw<Array<{ dia: string; n: number }>>`
    SELECT to_char(t.d AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') AS dia, count(*)::int AS n
    FROM (
      SELECT "fecha" AS d FROM "Pedido" WHERE "fecha" >= ${desde} AND "fecha" < ${hasta}
      UNION ALL SELECT "createdAt" FROM "Pago" WHERE "createdAt" >= ${desde} AND "createdAt" < ${hasta}
      UNION ALL SELECT "fecha" FROM "Gasto" WHERE "fecha" >= ${desde} AND "fecha" < ${hasta}
      UNION ALL SELECT "fecha" FROM "Embarque" WHERE "fecha" >= ${desde} AND "fecha" < ${hasta}
      UNION ALL SELECT "fecha" FROM "Produccion" WHERE "fecha" >= ${desde} AND "fecha" < ${hasta}
      UNION ALL SELECT "fecha" FROM "DescuentoRepartidor" WHERE "fecha" >= ${desde} AND "fecha" < ${hasta}
      UNION ALL SELECT "fecha" FROM "NotaCredito" WHERE "fecha" >= ${desde} AND "fecha" < ${hasta}
      UNION ALL SELECT "fecha" FROM "Factura" WHERE "fecha" >= ${desde} AND "fecha" < ${hasta}
    ) t
    GROUP BY 1`
  return new Map(filas.map((f) => [f.dia, Number(f.n)]))
}

export interface DiaPendiente extends DiaHueco {
  /** true si tuvo operación: hay que cerrarlo (nadie lo puede saltar). */
  obligatorio: boolean
}

/**
 * Días que se pueden cerrar hoy (#306): todos los días SIN cierre desde el primer cierre registrado hasta `hoy`
 * (tope de MAX_DIAS_HUECO días atrás). Incluye los omitidos que antes no tenían movimiento y ahora sí: así un día
 * omitido siempre se puede cerrar después, aunque ya exista un cierre posterior.
 */
export async function listarDiasPendientes(tx: Prisma.TransactionClient, hoy: string): Promise<DiaPendiente[]> {
  const primero = await tx.cierreDia.findFirst({ orderBy: { fecha: 'asc' }, select: { fecha: true } })
  if (!primero) return []
  const finDia = startOfDayInBogota(hoy).getTime() + DIA_MS
  const inicioTope = startOfDayInBogota(hoy).getTime() - (MAX_DIAS_HUECO - 1) * DIA_MS
  const inicio = Math.max(inicioTope, new Date(primero.fecha).getTime() + DIA_MS)
  if (inicio >= finDia) return []
  const [porDia, cerrados] = await Promise.all([
    contarOperacionesPorDia(tx, new Date(inicio), new Date(finDia)),
    tx.cierreDia.findMany({ where: { fecha: { gte: new Date(inicio), lt: new Date(finDia) } }, select: { fecha: true } }),
  ])
  const cerradosSet = new Set(cerrados.map((c) => dayInBogota(new Date(c.fecha))))
  const lista: DiaPendiente[] = []
  for (let t = inicio; t < finDia; t += DIA_MS) {
    const fecha = dayInBogota(new Date(t))
    if (cerradosSet.has(fecha)) continue
    const operaciones = porDia.get(fecha) ?? 0
    lista.push({ fecha, operaciones, obligatorio: operaciones > 0 })
  }
  return lista
}

/** Días con movimiento que siguen sin cierre ANTES de `fecha` (YYYY-MM-DD): bloquean el cierre de `fecha`. */
export async function diasObligatoriosAntesDe(tx: Prisma.TransactionClient, fecha: string): Promise<DiaPendiente[]> {
  const diaAnterior = dayInBogota(new Date(startOfDayInBogota(fecha).getTime() - DIA_MS))
  return (await listarDiasPendientes(tx, diaAnterior)).filter((d) => d.obligatorio)
}
