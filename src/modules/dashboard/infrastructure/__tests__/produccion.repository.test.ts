import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PrismaProduccionRepository } from '@/modules/dashboard/infrastructure/produccion.repository'

vi.mock('@/shared/infrastructure', () => ({
  prisma: {
    produccionItem: { findMany: vi.fn() },
  },
}))

import { prisma } from '@/shared/infrastructure'

const mockFindMany = prisma.produccionItem.findMany as unknown as ReturnType<typeof vi.fn>

describe('PrismaProduccionRepository.aggregateByDateRange', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('FIX 1.2: usa producido almacenado por item, NO suma conteos A+B (regresión doble count)', async () => {
    // Simula 2 items (PACA_AGUA + PACA_HIELO) de un dia
    mockFindMany.mockResolvedValue([
      { producto: 'PACA_AGUA', producido: 100, rotas: 2, filtradas: 1, consumoInterno: 1 },
      { producto: 'PACA_HIELO', producido: 50, rotas: 1, filtradas: 0, consumoInterno: 0 },
    ])

    const repo = new PrismaProduccionRepository()
    const result = await repo.aggregateByDateRange(
      new Date('2026-06-02T00:00:00Z'),
      new Date('2026-06-03T00:00:00Z'),
    )

    // Antes: sumaba conteoA+conteoB=200 (doble count). Ahora: producido=100 (correcto).
    expect(result.aguaProducida).toBe(100)
    expect(result.hieloProducido).toBe(50)
    expect(result.perdidasAgua).toBe(2 + 1 + 1)
    expect(result.perdidasHielo).toBe(1 + 0 + 0)
    expect(result.piezasProducidas).toBe(150)
    expect(result.perdidasTotales).toBe(5)
    expect(result.eficiencia).toBe(96.7)
  })

  it('devuelve 0 cuando no hay producción registrada', async () => {
    mockFindMany.mockResolvedValue([])

    const repo = new PrismaProduccionRepository()
    const result = await repo.aggregateByDateRange(
      new Date('2026-06-02T00:00:00Z'),
      new Date('2026-06-03T00:00:00Z'),
    )

    expect(result.aguaProducida).toBe(0)
    expect(result.hieloProducido).toBe(0)
    expect(result.perdidasAgua).toBe(0)
    expect(result.perdidasHielo).toBe(0)
    expect(result.piezasProducidas).toBe(0)
    expect(result.perdidasTotales).toBe(0)
    expect(result.eficiencia).toBe(0)
  })

  it('agrega correctamente múltiples turnos del mismo día', async () => {
    // Turno mañana + turno tarde → 2 producciones × 2 items = 4 items
    mockFindMany.mockResolvedValue([
      { producto: 'PACA_AGUA', producido: 30, rotas: 1, filtradas: 1, consumoInterno: 0 },
      { producto: 'PACA_HIELO', producido: 20, rotas: 1, filtradas: 0, consumoInterno: 0 },
      { producto: 'PACA_AGUA', producido: 50, rotas: 2, filtradas: 0, consumoInterno: 0 },
      { producto: 'PACA_HIELO', producido: 20, rotas: 1, filtradas: 0, consumoInterno: 0 },
    ])

    const repo = new PrismaProduccionRepository()
    const result = await repo.aggregateByDateRange(
      new Date('2026-06-02T00:00:00Z'),
      new Date('2026-06-03T00:00:00Z'),
    )

    expect(result.aguaProducida).toBe(80)
    expect(result.hieloProducido).toBe(40)
    expect(result.perdidasAgua).toBe(4) // (1+1+0) + (2+0+0)
    expect(result.perdidasHielo).toBe(2) // (1+0+0) + (1+0+0)
    expect(result.piezasProducidas).toBe(120)
    expect(result.perdidasTotales).toBe(6)
    expect(result.eficiencia).toBe(95)
  })

  it('FIX 1.2: filtra por rango de fecha via produccion.fecha', async () => {
    mockFindMany.mockResolvedValue([])

    const repo = new PrismaProduccionRepository()
    await repo.aggregateByDateRange(
      new Date('2026-06-02T00:00:00Z'),
      new Date('2026-06-03T00:00:00Z'),
    )

    // Verificar que la query filtra por produccion.fecha en el rango
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          produccion: expect.objectContaining({
            fecha: expect.objectContaining({
              gte: expect.any(Date),
              lt: expect.any(Date),
            }),
          }),
        }),
      }),
    )
  })
})
