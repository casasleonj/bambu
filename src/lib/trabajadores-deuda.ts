import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

/**
 * Deuda pendiente por trabajador (#566): suma de `montoPendiente` de las
 * deudas con saldo > 0 más el faltante de embarque aún no descontado en nómina. Dos consultas agrupadas, calculada en el servidor.
 *
 * Contrato del valor por trabajador:
 *  - `number` > 0 : tiene deuda (la tarjeta muestra el badge).
 *  - `0`          : sin deuda (la tarjeta no muestra nada).
 *  - `null`       : no se pudo calcular (la tarjeta muestra «Deuda no
 *                   disponible»). Nunca se devuelve 0 cuando falla la
 *                   consulta: sería un dato falso.
 */
export type DeudaPendientePorTrabajador = Map<string, number | null>

export async function deudaPendientePorTrabajador(
  trabajadorIds: string[],
): Promise<DeudaPendientePorTrabajador> {
  const resultado: DeudaPendientePorTrabajador = new Map()
  if (trabajadorIds.length === 0) return resultado

  try {
    // Misma cuenta que el detalle (src/lib/deuda-trabajador-resumen.ts): las deudas con saldo y el
    // faltante de embarque que la nómina todavía no descontó.
    const [grupos, descuentos] = await Promise.all([
      prisma.deudaTrabajador.groupBy({
        by: ['trabajadorId'],
        where: { trabajadorId: { in: trabajadorIds }, montoPendiente: { gt: 0 } },
        _sum: { montoPendiente: true },
      }),
      prisma.descuentoRepartidor.groupBy({
        by: ['trabajadorId'],
        where: { trabajadorId: { in: trabajadorIds }, aplicadoEnNomina: false },
        _sum: { monto: true },
      }),
    ])
    for (const id of trabajadorIds) resultado.set(id, 0)
    for (const g of grupos) {
      resultado.set(g.trabajadorId, Number(g._sum.montoPendiente ?? 0))
    }
    for (const d of descuentos) {
      resultado.set(d.trabajadorId, (resultado.get(d.trabajadorId) ?? 0) + Number(d._sum.monto ?? 0))
    }
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : 'Unknown' },
      'Error calculando deuda pendiente por trabajador (#566)',
    )
    for (const id of trabajadorIds) resultado.set(id, null)
  }
  return resultado
}

/** Agrega `deudaPendiente` a cada trabajador sin mutar la lista original. */
export async function conDeudaPendiente<T extends { id: string }>(
  trabajadores: T[],
): Promise<Array<T & { deudaPendiente: number | null }>> {
  const deudas = await deudaPendientePorTrabajador(trabajadores.map((t) => t.id))
  return trabajadores.map((t) => ({ ...t, deudaPendiente: deudas.get(t.id) ?? null }))
}
