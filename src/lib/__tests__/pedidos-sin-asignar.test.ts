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
  it('exige PENDIENTE, embarqueId null, y fecha anterior a hoy (Bogotá)', () => {
    const where = whereAtrasadosSinAsignar()
    expect(where).toMatchObject({
      estadoEntrega: 'PENDIENTE',
      embarqueId: null,
    })
    expect(where.fecha).toHaveProperty('lt')
    expect((where.fecha as { lt: Date }).lt).toBeInstanceOf(Date)
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
