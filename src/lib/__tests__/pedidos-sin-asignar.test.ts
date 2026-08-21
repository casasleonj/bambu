import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    pedido: {
      count: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { whereAtrasadosSinAsignar, countPedidosAtrasadosSinAsignar } from '@/lib/pedidos-sin-asignar'

const mockCount = prisma.pedido.count as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('whereAtrasadosSinAsignar', () => {
  it('exige PENDIENTE o NO_ENTREGADO, embarqueId null, y fecha anterior a hoy (Bogotá)', () => {
    const where = whereAtrasadosSinAsignar()
    expect(where).toMatchObject({
      estadoEntrega: { in: ['PENDIENTE', 'NO_ENTREGADO'] },
      embarqueId: null,
    })
    expect(where.fecha).toHaveProperty('lt')
    expect((where.fecha as { lt: Date }).lt).toBeInstanceOf(Date)
  })

  it('FIX: incluye NO_ENTREGADO — un pedido despachado y no entregado, sin reasignar, no vuelve a PENDIENTE por sí solo', () => {
    const where = whereAtrasadosSinAsignar()
    const estadoEntrega = where.estadoEntrega as { in: string[] }
    expect(estadoEntrega.in).toContain('PENDIENTE')
    expect(estadoEntrega.in).toContain('NO_ENTREGADO')
  })
})

describe('countPedidosAtrasadosSinAsignar', () => {
  it('cuenta con el where exacto de whereAtrasadosSinAsignar', async () => {
    mockCount.mockResolvedValueOnce(3)

    const result = await countPedidosAtrasadosSinAsignar()

    expect(result).toBe(3)
    expect(mockCount).toHaveBeenCalledWith({ where: whereAtrasadosSinAsignar() })
  })
})
