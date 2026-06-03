import { describe, it, expect, vi, beforeEach } from 'vitest'
import { evaluarStock, emptyStock, getStockDisponible, getStockEstimadoHoy } from '@/lib/stock'
import { prisma } from '@/lib/prisma'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    cierreDia: { findFirst: vi.fn() },
    produccion: { findMany: vi.fn() },
    produccionItem: { findMany: vi.fn() },
    embarque: { findMany: vi.fn() },
    config: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
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
  produccionItem: { findMany: ReturnType<typeof vi.fn> }
  embarque: { findMany: ReturnType<typeof vi.fn> }
  config: { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.cierreDia.findFirst.mockResolvedValue(null)
  mockPrisma.produccion.findMany.mockResolvedValue([])
  mockPrisma.produccionItem.findMany.mockResolvedValue([])
  mockPrisma.embarque.findMany.mockResolvedValue([])
  mockPrisma.config.findUnique.mockResolvedValue(null)
  mockPrisma.config.upsert.mockResolvedValue({})
  mockPrisma.config.deleteMany.mockResolvedValue({ count: 0 })
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

describe('getStockEstimadoHoy', () => {
  it('returns null when no config exists', async () => {
    mockPrisma.config.findUnique.mockResolvedValue(null)
    const result = await getStockEstimadoHoy()
    expect(result).toBeNull()
  })

  it('returns estimated stock when config exists for today', async () => {
    const today = new Date().toISOString().split('T')[0]
    mockPrisma.config.findUnique.mockResolvedValue({
      clave: 'stock_estimado_hoy',
      valor: JSON.stringify({ agua: 50, hielo: 30, fecha: today }),
    })
    const result = await getStockEstimadoHoy()
    expect(result).toEqual({ agua: 50, hielo: 30, fecha: today })
  })

  it('returns null when config is from a previous day', async () => {
    mockPrisma.config.findUnique.mockResolvedValue({
      clave: 'stock_estimado_hoy',
      valor: JSON.stringify({ agua: 50, hielo: 30, fecha: '2026-05-25' }),
    })
    const result = await getStockEstimadoHoy()
    expect(result).toBeNull()
  })
})

describe('getStockDisponible with estimated stock', () => {
  it('uses estimated stock as floor when higher than calculated', async () => {
    mockPrisma.cierreDia.findFirst.mockResolvedValue({
      stockFinAgua: 5,
      stockFinHielo: 3,
    })
    const today = new Date().toISOString().split('T')[0]
    mockPrisma.config.findUnique.mockResolvedValue({
      clave: 'stock_estimado_hoy',
      valor: JSON.stringify({ agua: 50, hielo: 30, fecha: today }),
    })

    const result = await getStockDisponible()

    expect(result.stock.PACA_AGUA).toBe(50)
    expect(result.stock.PACA_HIELO).toBe(30)
    expect(result.tieneEstimado).toBe(true)
  })

  it('uses calculated stock when higher than estimated', async () => {
    mockPrisma.cierreDia.findFirst.mockResolvedValue({
      stockFinAgua: 100,
      stockFinHielo: 80,
    })
    const today = new Date().toISOString().split('T')[0]
    mockPrisma.config.findUnique.mockResolvedValue({
      clave: 'stock_estimado_hoy',
      valor: JSON.stringify({ agua: 50, hielo: 30, fecha: today }),
    })

    const result = await getStockDisponible()

    expect(result.stock.PACA_AGUA).toBe(100)
    expect(result.stock.PACA_HIELO).toBe(80)
    expect(result.tieneEstimado).toBe(true)
  })

  it('returns tieneEstimado=false when no estimated stock', async () => {
    mockPrisma.cierreDia.findFirst.mockResolvedValue({
      stockFinAgua: 20,
      stockFinHielo: 15,
    })
    mockPrisma.config.findUnique.mockResolvedValue(null)

    const result = await getStockDisponible()

    expect(result.tieneEstimado).toBe(false)
  })
})

describe('evaluarStock with estimated stock', () => {
  it('reports deficit even when estimated stock is active', async () => {
    mockPrisma.cierreDia.findFirst.mockResolvedValue({
      stockFinAgua: 5,
      stockFinHielo: 3,
    })
    const today = new Date().toISOString().split('T')[0]
    mockPrisma.config.findUnique.mockResolvedValue({
      clave: 'stock_estimado_hoy',
      valor: JSON.stringify({ agua: 50, hielo: 30, fecha: today }),
    })
    const carga = emptyStock()
    carga.PACA_AGUA = 60

    const result = await evaluarStock(carga)

    expect(result.hasDeficit).toBe(true)
    expect(result.deficit.PACA_AGUA).toBe(10)
  })
})
