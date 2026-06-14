/**
 * Recalcula el score de demanda para UN cliente.
 *
 * Se llama desde:
 *  - POST /api/clientes/[id]/recompute-score (manual, botón admin)
 *  - POST /api/cron/recompute-scores (job diario, 6am Colombia)
 *
 * I/O:
 *  - Lee últimos 50 pedidos ENTREGADOS del cliente (incl. Pago para total)
 *  - Lee los contactos para enriquecer la info
 *  - Escribe intervaloMediano, proxEsperada, diasAtraso, scoreLlamada, etc.
 *
 * Idempotente: safe de correr múltiples veces.
 */

import { prisma } from '@/lib/prisma'
import { calcularFrecuenciaCliente } from './rfm'
import { calcularScoreLlamada } from './scoring'

const MAX_PEDIDOS_HISTORIAL = 50

export async function recomputeClienteScore(clienteId: string): Promise<void> {
  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: { id: true, activo: true },
  })
  if (!cliente || !cliente.activo) return

  // Traer los últimos N pedidos ENTREGADOS
  const pedidos = await prisma.pedido.findMany({
    where: { clienteId, estado: 'ENTREGADO' },
    select: { id: true, fecha: true, total: true, estadoEntrega: true },
    orderBy: { fecha: 'desc' },
    take: MAX_PEDIDOS_HISTORIAL,
  })

  // También considerar pedidos PENDIENTES/EN_RUTA recientes (la persona
  // pidió pero no se entregó aún, lo que importa para el patrón).
  const pedidosNoEntregados = await prisma.pedido.findMany({
    where: { clienteId, estado: { in: ['PENDIENTE', 'EN_RUTA'] } },
    select: { id: true, fecha: true, total: true },
    orderBy: { fecha: 'desc' },
    take: 10,
  })

  const todos = [...pedidos, ...pedidosNoEntregados]
  if (todos.length === 0) {
    await prisma.cliente.update({
      where: { id: clienteId },
      data: {
        intervaloMediano: null,
        proxEsperada: null,
        diasAtraso: 0,
        scoreLlamada: 0,
        valorTipico: null,
        scoreRecalculadoEn: new Date(),
      },
    })
    return
  }

  const fechas = todos.map(p => p.fecha)
  const ahora = new Date()
  const f = calcularFrecuenciaCliente(fechas, ahora)

  // Valor típico: promedio de los últimos 10
  const recientes = todos.slice(0, 10)
  const valorTipico =
    recientes.reduce((acc, p) => acc + Number(p.total), 0) / Math.max(1, recientes.length)

  const score = calcularScoreLlamada({
    diasAtraso: f.diasAtraso,
    valorTipico,
  })

  await prisma.cliente.update({
    where: { id: clienteId },
    data: {
      intervaloMediano: f.intervaloMediano,
      proxEsperada: f.proxEsperada,
      diasAtraso: f.diasAtraso,
      scoreLlamada: score,
      valorTipico: Math.round(valorTipico * 100) / 100,
      scoreRecalculadoEn: ahora,
    },
  })
}
