import type { Prisma } from '@prisma/client'
import { dayInBogota } from '@/lib/date-helpers'

/**
 * #306 (decisión del PO, 2026-11-02): entre el último cierre y el día que se quiere cerrar
 * pueden quedar días sin cerrar («hueco»).
 *
 * - Un día SIN operación (domingo, festivo, día sin ventas) se salta solo.
 * - Un día CON operación sigue bloqueando el cierre: su dinero y su stock no entrarían en
 *   ningún cierre. Solo el ADMIN puede saltarlo, dejando un motivo que queda en el historial.
 *
 * Operación = cualquier registro con fecha dentro del día de Bogotá: pedidos, pagos capturados,
 * gastos, embarques, producción, descuentos al repartidor, notas crédito o facturas.
 */

const DIA_MS = 86_400_000
/** Tope de días revisados: más allá se considera hueco con operación (hay que cerrar primero). */
export const MAX_DIAS_HUECO = 45

export interface DiaHueco {
  /** YYYY-MM-DD (Bogotá) */
  fecha: string
  /** Cantidad de registros con operación ese día (0 = día sin operación). */
  operaciones: number
}

export interface AnalisisHueco {
  dias: DiaHueco[]
  /** Días del hueco que tuvieron operación. */
  conOperacion: DiaHueco[]
  /** true si el hueco es más largo que el tope revisable. */
  excedeTope: boolean
}

async function contarOperacionesDelDia(tx: Prisma.TransactionClient, inicio: Date): Promise<number> {
  const rango = { gte: inicio, lt: new Date(inicio.getTime() + DIA_MS) }
  const conteos = await Promise.all([
    tx.pedido.count({ where: { fecha: rango } }),
    tx.pago.count({ where: { createdAt: rango } }),
    tx.gasto.count({ where: { fecha: rango } }),
    tx.embarque.count({ where: { fecha: rango } }),
    tx.produccion.count({ where: { fecha: rango } }),
    tx.descuentoRepartidor.count({ where: { fecha: rango } }),
    tx.notaCredito.count({ where: { fecha: rango } }),
    tx.factura.count({ where: { fecha: rango } }),
  ])
  return conteos.reduce((a, b) => a + b, 0)
}

/**
 * Días entre el último cierre y el día solicitado (ambos exclusivos), con su actividad.
 * `ultimoCierre` y `solicitado` son el inicio del día de Bogotá (instantes UTC).
 */
export async function analizarHueco(
  tx: Prisma.TransactionClient,
  ultimoCierre: Date,
  solicitado: Date,
): Promise<AnalisisHueco> {
  const dias: DiaHueco[] = []
  const totalDias = Math.round((solicitado.getTime() - ultimoCierre.getTime()) / DIA_MS) - 1
  if (totalDias <= 0) return { dias, conOperacion: [], excedeTope: false }
  if (totalDias > MAX_DIAS_HUECO) return { dias, conOperacion: [], excedeTope: true }

  for (let i = 1; i <= totalDias; i++) {
    const inicio = new Date(ultimoCierre.getTime() + i * DIA_MS)
    dias.push({ fecha: dayInBogota(inicio), operaciones: await contarOperacionesDelDia(tx, inicio) })
  }
  return { dias, conOperacion: dias.filter((d) => d.operaciones > 0), excedeTope: false }
}

/** Texto del motivo del salto: obligatorio, claro, ni vacío ni de relleno. */
export function motivoSaltoValido(motivo: string | undefined | null): motivo is string {
  return typeof motivo === 'string' && motivo.trim().length >= 10
}
