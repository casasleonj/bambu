import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PrismaProduccionRepository } from '@/modules/dashboard/infrastructure/produccion.repository'

vi.mock('@/shared/infrastructure', () => ({
  prisma: {
    produccion: { aggregate: vi.fn() },
  },
}))

import { prisma } from '@/shared/infrastructure'

const mockAggregate = prisma.produccion.aggregate as unknown as ReturnType<typeof vi.fn>

describe('PrismaProduccionRepository.aggregateByDateRange', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('FIX 1.2: usa prodAgua/prodHielo almacenados, NO suma conteos A+B (regresión doble count)', async () => {
    // Simula registros con prodAgua=100, prodHielo=50 (lo que realmente guardó el sistema)
    mockAggregate.mockResolvedValue({
      _sum: {
        prodAgua: 100,
        prodHielo: 50,
        rotasAgua: 2,
        rotasHielo: 1,
        filtradasAgua: 1,
        filtradasHielo: 0,
        consumoInternoAgua: 1,
        consumoInternoHielo: 0,
      },
    })

    const repo = new PrismaProduccionRepository()
    const result = await repo.aggregateByDateRange(
      new Date('2026-06-02T00:00:00Z'),
      new Date('2026-06-03T00:00:00Z'),
    )

    // Antes: sumaba conteoA+conteoB=200 (doble count). Ahora: prodAgua=100 (correcto).
    expect(result.aguaProducida).toBe(100)
    expect(result.hieloProducido).toBe(50)
    expect(result.perdidasAgua).toBe(2 + 1 + 1)
    expect(result.perdidasHielo).toBe(1 + 0 + 0)
  })

  it('devuelve 0 cuando no hay producción registrada', async () => {
    mockAggregate.mockResolvedValue({
      _sum: {
        prodAgua: null,
        prodHielo: null,
        rotasAgua: null,
        rotasHielo: null,
        filtradasAgua: null,
        filtradasHielo: null,
        consumoInternoAgua: null,
        consumoInternoHielo: null,
      },
    })

    const repo = new PrismaProduccionRepository()
    const result = await repo.aggregateByDateRange(
      new Date('2026-06-02T00:00:00Z'),
      new Date('2026-06-03T00:00:00Z'),
    )

    expect(result.aguaProducida).toBe(0)
    expect(result.hieloProducido).toBe(0)
    expect(result.perdidasAgua).toBe(0)
    expect(result.perdidasHielo).toBe(0)
  })

  it('agrega correctamente múltiples registros del mismo día', async () => {
    mockAggregate.mockResolvedValue({
      _sum: {
        prodAgua: 80, // turno mañana 30 + turno tarde 50
        prodHielo: 40,
        rotasAgua: 3,
        rotasHielo: 2,
        filtradasAgua: 1,
        filtradasHielo: 0,
        consumoInternoAgua: 0,
        consumoInternoHielo: 0,
      },
    })

    const repo = new PrismaProduccionRepository()
    const result = await repo.aggregateByDateRange(
      new Date('2026-06-02T00:00:00Z'),
      new Date('2026-06-03T00:00:00Z'),
    )

    expect(result.aguaProducida).toBe(80)
    expect(result.hieloProducido).toBe(40)
    expect(result.perdidasAgua).toBe(4)
    expect(result.perdidasHielo).toBe(2)
  })

  it('FIX 1.2: NO incluye conteoA/conteoB en el _sum (debe sumar prodAgua)', async () => {
    mockAggregate.mockResolvedValue({
      _sum: {
        prodAgua: 100,
        prodHielo: 50,
        rotasAgua: 0,
        rotasHielo: 0,
        filtradasAgua: 0,
        filtradasHielo: 0,
        consumoInternoAgua: 0,
        consumoInternoHielo: 0,
      },
    })

    const repo = new PrismaProduccionRepository()
    await repo.aggregateByDateRange(
      new Date('2026-06-02T00:00:00Z'),
      new Date('2026-06-03T00:00:00Z'),
    )

    // Verificar que se llamó con prodAgua/prodHielo y NO con conteoAAgua/conteoBAgua
    expect(mockAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        _sum: expect.objectContaining({
          prodAgua: true,
          prodHielo: true,
        }),
      }),
    )
    const callArgs = mockAggregate.mock.calls[0][0]
    expect(callArgs._sum).not.toHaveProperty('conteoAAgua')
    expect(callArgs._sum).not.toHaveProperty('conteoBAgua')
    expect(callArgs._sum).not.toHaveProperty('conteoAHielo')
    expect(callArgs._sum).not.toHaveProperty('conteoBHielo')
  })
})
