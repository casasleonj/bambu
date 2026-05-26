import { describe, it, expect, vi, beforeEach } from 'vitest'
import { evaluarStock, emptyStock } from '@/lib/stock'
import { prisma } from '@/lib/prisma'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    cierreDia: { findFirst: vi.fn() },
    produccion: { findMany: vi.fn() },
    embarque: { findMany: vi.fn() },
  },
}))

vi.mock('@/lib/dates', () => ({
  getTodayRange: () => ({
    startOfDay: new Date('2026-05-26T00:00:00Z'),
    endOfDay: new Date('2026-05-27T00:00:00Z'),
  }),
}))

const mockPrisma = prisma as unknown as {
  cierreDia: { findFirst: ReturnType<typeof vi.fn> }
  produccion: { findMany: ReturnType<typeof vi.fn> }
  embarque: { findMany: ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.cierreDia.findFirst.mockResolvedValue(null)
  mockPrisma.produccion.findMany.mockResolvedValue([])
  mockPrisma.embarque.findMany.mockResolvedValue([])
})

describe('evaluarStock', () => {
  it('returns ok when carga <= disponible', async () => {
    mockPrisma.cierreDia.findFirst.mockResolvedValue({
      stockFinAgua: 20,
      stockFinHielo: 15,
    })
    const carga = emptyStock()
    carga.PACA_AGUA = 10
    carga.PACA_HIELO = 5

    const result = await evaluarStock(carga)

    expect(result.ok).toBe(true)
    expect(result.hasDeficit).toBe(false)
    expect(result.totalDeficit).toBe(0)
    expect(result.disponible.PACA_AGUA).toBe(20)
    expect(result.disponible.PACA_HIELO).toBe(15)
  })

  it('returns deficit when carga > disponible', async () => {
    mockPrisma.cierreDia.findFirst.mockResolvedValue({
      stockFinAgua: 5,
      stockFinHielo: 3,
    })
    const carga = emptyStock()
    carga.PACA_AGUA = 10
    carga.PACA_HIELO = 8

    const result = await evaluarStock(carga)

    expect(result.ok).toBe(false)
    expect(result.hasDeficit).toBe(true)
    expect(result.totalDeficit).toBe(10)
    expect(result.deficit.PACA_AGUA).toBe(5)
    expect(result.deficit.PACA_HIELO).toBe(5)
  })

  it('ignores BOTELLON/BOLSAS from deficit calculation', async () => {
    mockPrisma.cierreDia.findFirst.mockResolvedValue({
      stockFinAgua: 10,
      stockFinHielo: 10,
    })
    const carga = emptyStock()
    carga.BOTELLON = 50
    carga.BOLSA_AGUA = 30
    carga.BOLSA_HIELO = 20

    const result = await evaluarStock(carga)

    expect(result.ok).toBe(true)
    expect(result.hasDeficit).toBe(false)
  })

  it('subtracts open embarques from available stock', async () => {
    mockPrisma.cierreDia.findFirst.mockResolvedValue({
      stockFinAgua: 30,
      stockFinHielo: 20,
    })
    mockPrisma.embarque.findMany
      .mockResolvedValueOnce([
        {
          id: 'e1',
          estado: 'ABIERTO',
          pacasAgua: 0,
          pacasHielo: 0,
          productos: [
            { producto: 'PACA_AGUA', cargadas: 10 },
            { producto: 'PACA_HIELO', cargadas: 5 },
          ],
        },
      ])
      .mockResolvedValueOnce([])

    const carga = emptyStock()
    carga.PACA_AGUA = 25

    const result = await evaluarStock(carga)

    expect(result.ok).toBe(false)
    expect(result.deficit.PACA_AGUA).toBe(5)
  })
})
