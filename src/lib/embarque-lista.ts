import type { PrismaClient } from '@prisma/client'

/**
 * Embarque y repartidor de cada pedido de una PÁGINA de la lista (P2-3, B-16,
 * #453). Una sola consulta por lote (sin N+1). Lo comparten `GET /api/pedidos`
 * y la carga inicial de `/pedidos` para que ambas devuelvan los mismos campos
 * (mismo contrato que `pickCoords`/`pickDireccionTexto`: una regla, dos
 * consumidores).
 */
export interface EmbarqueLista {
  numeroDia: number
  repartidor: string | null
}

type PrismaLectura = Pick<PrismaClient, 'embarque'>

export async function cargarEmbarquesLista(
  prisma: PrismaLectura,
  embarqueIds: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, EmbarqueLista>> {
  const ids = [...new Set(embarqueIds.filter((id): id is string => Boolean(id)))]
  if (ids.length === 0) return new Map()
  const embarques = await prisma.embarque.findMany({
    where: { id: { in: ids } },
    select: { id: true, numeroDia: true, trabajador: { select: { nombre: true } } },
  })
  return new Map(
    embarques.map((e) => [e.id, { numeroDia: e.numeroDia, repartidor: e.trabajador?.nombre ?? null }]),
  )
}

/** Campos aditivos que se agregan a cada pedido de la lista (null si no tiene embarque). */
export function camposEmbarqueLista(
  embarqueId: string | null | undefined,
  porId: ReadonlyMap<string, EmbarqueLista>,
): { embarqueNumeroDia: number | null; embarqueRepartidor: string | null } {
  const e = embarqueId ? porId.get(embarqueId) : undefined
  return { embarqueNumeroDia: e?.numeroDia ?? null, embarqueRepartidor: e?.repartidor ?? null }
}
