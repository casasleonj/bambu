// #656 (slice 2b): registra la entrega exigible dentro de la transacción de entrega.
// Recibe el tx de Prisma y usa las funciones puras de `entregas-exigibles.ts`.
import type { Prisma } from '@prisma/client'
import { asignarPagoFIFO, validarInvariantesExigibles, type EntregaExigibleCalc } from '@/lib/entregas-exigibles'

export interface LineaEntregada {
  producto: string
  cantidad: number
  precioCents: number
}

/**
 * Crea la EntregaExigible de este evento con su valor real. Si el pedido ya tenía dinero pagado sin
 * asignar (prepago), lo reparte FIFO: primero a las entregas más antiguas. Luego valida las invariantes.
 * No hace nada si el evento no tiene valor (p. ej. solo cantidades en cero).
 */
export async function registrarEntregaExigible(
  tx: Prisma.TransactionClient,
  input: {
    pedidoId: string
    entregadoAt: Date
    lineas: LineaEntregada[]
    pedido: { total: number; totalPagado: number; saldo: number }
  },
): Promise<void> {
  const valorCents = input.lineas.reduce((t, l) => t + Math.max(0, l.cantidad) * l.precioCents, 0)
  if (valorCents <= 0) return

  const previas = await tx.entregaExigible.findMany({
    where: { pedidoId: input.pedidoId },
    select: { id: true, entregadoAt: true, valorEntregado: true, asignado: true },
  })
  const calc: EntregaExigibleCalc[] = previas.map((p) => ({
    id: p.id,
    entregadoAt: p.entregadoAt,
    valorEntregado: Number(p.valorEntregado),
    asignado: Number(p.asignado),
  }))

  const nuevaId = `${input.pedidoId}:${input.entregadoAt.getTime()}:${calc.length}`
  const todas: EntregaExigibleCalc[] = [
    ...calc,
    { id: nuevaId, entregadoAt: input.entregadoAt, valorEntregado: valorCents / 100, asignado: 0 },
  ]

  // Prepago sin asignar: lo que está pagado y no cubre ninguna entrega previa.
  const yaAsignado = calc.reduce((t, e) => t + e.asignado, 0)
  const sinAsignar = Math.max(0, input.pedido.totalPagado - yaAsignado)
  const { deltas } = asignarPagoFIFO(todas, sinAsignar)

  // Aplicar: las previas que recibieron asignación y la nueva.
  for (const e of calc) {
    const d = deltas.get(e.id)
    if (d) await tx.entregaExigible.update({ where: { id: e.id }, data: { asignado: e.asignado + d } })
  }
  await tx.entregaExigible.create({
    data: {
      pedidoId: input.pedidoId,
      entregadoAt: input.entregadoAt,
      valorEntregado: valorCents / 100,
      asignado: deltas.get(nuevaId) ?? 0,
    },
  })

  const finales: EntregaExigibleCalc[] = todas.map((e) => ({
    ...e,
    asignado: e.id === nuevaId ? (deltas.get(nuevaId) ?? 0) : e.asignado + (deltas.get(e.id) ?? 0),
  }))
  validarInvariantesExigibles(finales, input.pedido)
}
