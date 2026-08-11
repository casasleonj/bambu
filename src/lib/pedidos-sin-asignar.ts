/**
 * Regla única: "pedido atrasado sin asignar" — pendiente, sin embarque,
 * de un día anterior a hoy (Bogotá). Ver plan en
 * docs/superpowers/... (o AGENTS.md) para el contexto completo.
 *
 * Un solo lugar define el `where` exacto para que el KPI del dashboard,
 * el badge de Pedidos, y el filtro de la API nunca puedan mostrar
 * números distintos entre sí.
 */
import { prisma } from '@/lib/prisma'
import { startOfDayBogota } from '@/lib/dates'
import type { Prisma } from '@prisma/client'

export function whereAtrasadosSinAsignar(): Prisma.PedidoWhereInput {
  return {
    estadoEntrega: 'PENDIENTE',
    embarqueId: null,
    fecha: { lt: startOfDayBogota() },
  }
}

export async function countPedidosAtrasadosSinAsignar(): Promise<number> {
  return prisma.pedido.count({ where: whereAtrasadosSinAsignar() })
}
