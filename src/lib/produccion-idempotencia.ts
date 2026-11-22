// #630 · Idempotencia semántica de Producción.
// La huella se guarda en Historial CREATE (dentro de la misma transacción).
// Para registros antiguos sin huella, se compara contra el estado persistido
// y ante diferencias se falla cerrado: nunca afirmar que se aplicó un cambio.
import { createHash } from 'node:crypto'
import type { ProduccionItem } from '@prisma/client'
import type { z } from 'zod'
import { ProduccionCreateSchema } from '@/lib/validators'

type Entrada = z.infer<typeof ProduccionCreateSchema>
type ItemComparable = Pick<ProduccionItem,
  'producto' | 'conteoA' | 'conteoB' | 'stockFinFisico' | 'filtradas' | 'rotas' | 'consumoInterno' | 'producido'
>

export type ProduccionComparable = {
  trabajadorId: string
  turno: string
  fecha: Date
  obs: string | null
  items: ItemComparable[]
}

/** Hash del contenido de la operación, independiente del orden de los dos items. */
export function huellaCreacionProduccion(entrada: Entrada, fecha: Date): string {
  const items = [...entrada.items].sort((a, b) => a.producto.localeCompare(b.producto)).map(i => ({
    producto: i.producto,
    conteoA: i.conteoA,
    conteoB: i.conteoB,
    stockFinFisico: i.stockFinFisico,
    filtradas: i.filtradas,
    rotas: i.rotas,
    consumoInterno: i.consumoInterno,
  }))
  const contenido = JSON.stringify({
    fecha: fecha.toISOString(),
    trabajadorId: entrada.trabajadorId,
    turno: entrada.turno,
    obs: entrada.obs?.trim() ?? '',
    botellonesLlenados: entrada.botellonesLlenados,
    // null conserva diferencia entre no haber contado y contar expresamente.
    stockFinBotellones: entrada.stockFinBotellones ?? null,
    items,
  })
  return createHash('sha256').update(contenido).digest('hex')
}

/** Fallback histórico: sin huella original solo se puede verificar el estado actual. */
export function coincideProduccionPersistida(
  original: ProduccionComparable,
  entrada: Entrada,
  fecha: Date,
): boolean {
  if (original.fecha.getTime() !== fecha.getTime()) return false
  if (original.trabajadorId !== entrada.trabajadorId || original.turno !== entrada.turno) return false
  if ((original.obs ?? '') !== (entrada.obs?.trim() ?? '')) return false

  for (const nuevo of entrada.items) {
    const viejo = original.items.find(i => i.producto === nuevo.producto)
    if (!viejo) return false
    if (
      viejo.conteoA !== nuevo.conteoA ||
      viejo.conteoB !== nuevo.conteoB ||
      viejo.stockFinFisico !== nuevo.stockFinFisico ||
      viejo.filtradas !== nuevo.filtradas ||
      viejo.rotas !== nuevo.rotas ||
      viejo.consumoInterno !== nuevo.consumoInterno
    ) return false
  }

  const bot = original.items.find(i => i.producto === 'BOTELLON')
  if ((bot?.producido ?? 0) !== entrada.botellonesLlenados) return false
  if (entrada.stockFinBotellones !== undefined && bot?.stockFinFisico !== entrada.stockFinBotellones) return false
  return true
}
