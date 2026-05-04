import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    precioVolumen: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    cliente: {
      findUnique: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import {
  parsePreciosEspeciales,
  resolverPrecio,
  resolverPreciosPedido,
  getPriceTable,
} from '@/lib/pricing'

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── parsePreciosEspeciales ──────────────────────────────────────────

describe('parsePreciosEspeciales', () => {
  it('returns empty channels for null', () => {
    expect(parsePreciosEspeciales(null)).toEqual({ DOMICILIO: {}, PUNTO: {} })
  })

  it('returns empty channels for undefined', () => {
    expect(parsePreciosEspeciales(undefined)).toEqual({ DOMICILIO: {}, PUNTO: {} })
  })

  it('returns empty channels for invalid JSON', () => {
    expect(parsePreciosEspeciales('{broken')).toEqual({ DOMICILIO: {}, PUNTO: {} })
  })

  it('parses new format with both channels', () => {
    const json = JSON.stringify({
      DOMICILIO: { PACA_AGUA: 6000, PACA_HIELO: 8000 },
      PUNTO: { PACA_AGUA: 5500 },
    })
    expect(parsePreciosEspeciales(json)).toEqual({
      DOMICILIO: { PACA_AGUA: 6000, PACA_HIELO: 8000 },
      PUNTO: { PACA_AGUA: 5500 },
    })
  })

  it('parses new format with only PUNTO', () => {
    const json = JSON.stringify({ PUNTO: { PACA_AGUA: 5000 } })
    expect(parsePreciosEspeciales(json)).toEqual({
      DOMICILIO: {},
      PUNTO: { PACA_AGUA: 5000 },
    })
  })

  it('parses new format with only DOMICILIO', () => {
    const json = JSON.stringify({ DOMICILIO: { BOTELLON_DOM: 12000 } })
    expect(parsePreciosEspeciales(json)).toEqual({
      DOMICILIO: { BOTELLON_DOM: 12000 },
      PUNTO: {},
    })
  })

  it('applies legacy flat format to both channels', () => {
    const json = JSON.stringify({ PACA_AGUA: 6000, PACA_HIELO: 8000 })
    expect(parsePreciosEspeciales(json)).toEqual({
      DOMICILIO: { PACA_AGUA: 6000, PACA_HIELO: 8000 },
      PUNTO: { PACA_AGUA: 6000, PACA_HIELO: 8000 },
    })
  })

  it('handles empty object', () => {
    expect(parsePreciosEspeciales('{}')).toEqual({ DOMICILIO: {}, PUNTO: {} })
  })
})

// ─── resolverPrecio ──────────────────────────────────────────────────

describe('resolverPrecio', () => {
  it('returns manual price when > 0', async () => {
    const result = await resolverPrecio('PACA_AGUA', 10, 'PUNTO', null, 5000)
    expect(result).toEqual({ precio: 5000, origen: 'manual' })
  })

  it('ignores manual price of 0', async () => {
    vi.mocked(prisma.precioVolumen.findFirst).mockResolvedValue(null)
    const result = await resolverPrecio('PACA_AGUA', 10, 'PUNTO', null, 0)
    expect(result).toEqual({ precio: 0, origen: 'base' })
  })

  it('ignores manual price of null', async () => {
    vi.mocked(prisma.precioVolumen.findFirst).mockResolvedValue(null)
    const result = await resolverPrecio('PACA_AGUA', 10, 'PUNTO', null, null)
    expect(result).toEqual({ precio: 0, origen: 'base' })
  })

  it('returns client override for matching canal (new format)', async () => {
    const overrides = { DOMICILIO: { PACA_AGUA: 7000 }, PUNTO: { PACA_AGUA: 6000 } }
    const result = await resolverPrecio('PACA_AGUA', 10, 'PUNTO', overrides as any)
    expect(result).toEqual({ precio: 6000, origen: 'cliente' })
  })

  it('returns client override for matching canal (new format, DOMICILIO)', async () => {
    const overrides = { DOMICILIO: { PACA_AGUA: 7000 }, PUNTO: { PACA_AGUA: 6000 } }
    const result = await resolverPrecio('PACA_AGUA', 10, 'DOMICILIO', overrides as any)
    expect(result).toEqual({ precio: 7000, origen: 'cliente' })
  })

  it('applies legacy flat override to both canals', async () => {
    const overrides = { PACA_AGUA: 8000 }
    const result = await resolverPrecio('PACA_AGUA', 10, 'PUNTO', overrides as any)
    expect(result).toEqual({ precio: 8000, origen: 'cliente' })
  })

  it('skips override when value is 0', async () => {
    vi.mocked(prisma.precioVolumen.findFirst).mockResolvedValue(null)
    const overrides = { PUNTO: { PACA_AGUA: 0 } }
    const result = await resolverPrecio('PACA_AGUA', 10, 'PUNTO', overrides as any)
    expect(result).toEqual({ precio: 0, origen: 'base' })
  })

  it('skips override when code not present for canal', async () => {
    vi.mocked(prisma.precioVolumen.findFirst).mockResolvedValue(null)
    const overrides = { PUNTO: { PACA_HIELO: 6000 } }
    const result = await resolverPrecio('PACA_AGUA', 10, 'PUNTO', overrides as any)
    expect(result).toEqual({ precio: 0, origen: 'base' })
  })

  it('skips override when clienteOverrides is null', async () => {
    vi.mocked(prisma.precioVolumen.findFirst).mockResolvedValue(null)
    const result = await resolverPrecio('PACA_AGUA', 10, 'PUNTO', null)
    expect(result).toEqual({ precio: 0, origen: 'base' })
  })

  it('handles clienteOverrides as JSON string', async () => {
    const overrides = JSON.stringify({ PUNTO: { BOTELLON_FAB: 15000 } })
    const result = await resolverPrecio('BOTELLON_FAB', 5, 'PUNTO', overrides as any)
    expect(result).toEqual({ precio: 15000, origen: 'cliente' })
  })

  it('returns volume tier when no manual/override', async () => {
    vi.mocked(prisma.precioVolumen.findFirst).mockResolvedValue({
      precio: 5500,
    } as any)
    const result = await resolverPrecio('PACA_AGUA', 10, 'PUNTO')
    expect(result).toEqual({ precio: 5500, origen: 'volumen' })
    expect(prisma.precioVolumen.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          producto: { codigo: 'PACA_AGUA' },
          canal: 'PUNTO',
          cantMin: { lte: 10 },
          activo: true,
        }),
        orderBy: { cantMin: 'desc' },
      }),
    )
  })

  it('picks highest cantMin tier when multiple match', async () => {
    vi.mocked(prisma.precioVolumen.findFirst).mockResolvedValue({
      precio: 4500,
    } as any)
    const result = await resolverPrecio('PACA_AGUA', 50, 'PUNTO')
    expect(result).toEqual({ precio: 4500, origen: 'volumen' })
  })

  it('matches tier with null cantMax (unlimited upper bound)', async () => {
    vi.mocked(prisma.precioVolumen.findFirst).mockResolvedValue({
      precio: 4000,
    } as any)
    const result = await resolverPrecio('PACA_AGUA', 500, 'PUNTO')
    expect(result).toEqual({ precio: 4000, origen: 'volumen' })
  })

  it('returns base (0) when no tiers match', async () => {
    vi.mocked(prisma.precioVolumen.findFirst).mockResolvedValue(null)
    const result = await resolverPrecio('PACA_AGUA', 1, 'PUNTO')
    expect(result).toEqual({ precio: 0, origen: 'base' })
  })

  it('returns base when no tiers exist at all', async () => {
    vi.mocked(prisma.precioVolumen.findFirst).mockResolvedValue(null)
    const result = await resolverPrecio('BOLSA_HIELO', 5, 'DOMICILIO')
    expect(result).toEqual({ precio: 0, origen: 'base' })
  })

  it('manual price has highest priority over all', async () => {
    const overrides = { PUNTO: { PACA_AGUA: 6000 } }
    vi.mocked(prisma.precioVolumen.findFirst).mockResolvedValue({
      precio: 5500,
    } as any)
    const result = await resolverPrecio('PACA_AGUA', 10, 'PUNTO', overrides as any, 9999)
    expect(result).toEqual({ precio: 9999, origen: 'manual' })
    expect(prisma.precioVolumen.findFirst).not.toHaveBeenCalled()
  })

  it('uses custom db client when provided', async () => {
    const mockDb = {
      precioVolumen: { findFirst: vi.fn().mockResolvedValue({ precio: 3200 } as any) },
    } as any
    const result = await resolverPrecio('PACA_HIELO', 5, 'DOMICILIO', null, null, mockDb)
    expect(result).toEqual({ precio: 3200, origen: 'volumen' })
    expect(mockDb.precioVolumen.findFirst).toHaveBeenCalled()
    expect(prisma.precioVolumen.findFirst).not.toHaveBeenCalled()
  })
})

// ─── resolverPreciosPedido ───────────────────────────────────────────

describe('resolverPreciosPedido', () => {
  const items = [
    { codigo: 'PACA_AGUA' as const, cantidad: 10 },
    { codigo: 'PACA_HIELO' as const, cantidad: 5 },
  ]

  it('returns empty array for empty items', async () => {
    const result = await resolverPreciosPedido([], 'PUNTO')
    expect(result).toEqual([])
  })

  it('skips items with cantidad 0', async () => {
    vi.mocked(prisma.precioVolumen.findMany).mockResolvedValue([])
    const result = await resolverPreciosPedido(
      [
        { codigo: 'PACA_AGUA' as const, cantidad: 0 },
        { codigo: 'PACA_HIELO' as const, cantidad: 5 },
      ],
      'PUNTO',
    )
    expect(result).toHaveLength(1)
    expect(result[0].codigo).toBe('PACA_HIELO')
  })

  it('skips items with negative cantidad', async () => {
    vi.mocked(prisma.precioVolumen.findMany).mockResolvedValue([])
    const result = await resolverPreciosPedido(
      [
        { codigo: 'PACA_AGUA' as const, cantidad: -3 },
        { codigo: 'PACA_HIELO' as const, cantidad: 5 },
      ],
      'PUNTO',
    )
    expect(result).toHaveLength(1)
    expect(result[0].codigo).toBe('PACA_HIELO')
  })

  it('resolves manual prices', async () => {
    vi.mocked(prisma.precioVolumen.findMany).mockResolvedValue([])
    const result = await resolverPreciosPedido(
      [{ codigo: 'PACA_AGUA' as const, cantidad: 10, precioManual: 6000 }],
      'PUNTO',
    )
    expect(result).toEqual([{
      codigo: 'PACA_AGUA',
      precio: 6000,
      cantidad: 10,
      subtotal: 60000,
      origen: 'manual',
    }])
  })

  it('resolves client overrides from DB when clienteId provided', async () => {
    vi.mocked(prisma.cliente.findUnique).mockResolvedValue({
      preciosEspeciales: JSON.stringify({ PUNTO: { PACA_AGUA: 7000 } }),
    } as any)
    vi.mocked(prisma.precioVolumen.findMany).mockResolvedValue([])

    const result = await resolverPreciosPedido(
      [{ codigo: 'PACA_AGUA' as const, cantidad: 10 }],
      'PUNTO',
      'cliente-1',
    )
    expect(result).toEqual([{
      codigo: 'PACA_AGUA',
      precio: 7000,
      cantidad: 10,
      subtotal: 70000,
      origen: 'cliente',
    }])
  })

  it('applies legacy client override to both canals', async () => {
    vi.mocked(prisma.cliente.findUnique).mockResolvedValue({
      preciosEspeciales: JSON.stringify({ PACA_AGUA: 8000 }),
    } as any)
    vi.mocked(prisma.precioVolumen.findMany).mockResolvedValue([])

    const result = await resolverPreciosPedido(
      [{ codigo: 'PACA_AGUA' as const, cantidad: 10 }],
      'DOMICILIO',
      'cliente-1',
    )
    expect(result).toEqual([{
      codigo: 'PACA_AGUA',
      precio: 8000,
      cantidad: 10,
      subtotal: 80000,
      origen: 'cliente',
    }])
  })

  it('falls through to volume tiers when no override match', async () => {
    vi.mocked(prisma.cliente.findUnique).mockResolvedValue({
      preciosEspeciales: JSON.stringify({ PUNTO: { PACA_HIELO: 5000 } }),
    } as any)
    vi.mocked(prisma.precioVolumen.findMany).mockResolvedValue([
      {
        producto: { codigo: 'PACA_AGUA' },
        cantMin: 1,
        cantMax: 50,
        precio: 5500,
      },
    ] as any)

    const result = await resolverPreciosPedido(
      [{ codigo: 'PACA_AGUA' as const, cantidad: 10 }],
      'PUNTO',
      'cliente-1',
    )
    expect(result).toEqual([{
      codigo: 'PACA_AGUA',
      precio: 5500,
      cantidad: 10,
      subtotal: 55000,
      origen: 'volumen',
    }])
  })

  it('falls through to volume tiers when clienteId but no preciosEspeciales', async () => {
    vi.mocked(prisma.cliente.findUnique).mockResolvedValue({ preciosEspeciales: null } as any)
    vi.mocked(prisma.precioVolumen.findMany).mockResolvedValue([
      {
        producto: { codigo: 'PACA_HIELO' },
        cantMin: 1,
        cantMax: 20,
        precio: 8000,
      },
    ] as any)

    const result = await resolverPreciosPedido(
      [{ codigo: 'PACA_HIELO' as const, cantidad: 3 }],
      'PUNTO',
      'cliente-2',
    )
    expect(result).toEqual([{
      codigo: 'PACA_HIELO',
      precio: 8000,
      cantidad: 3,
      subtotal: 24000,
      origen: 'volumen',
    }])
  })

  it('batch-loads tiers with single DB query', async () => {
    vi.mocked(prisma.precioVolumen.findMany).mockResolvedValue([
      { producto: { codigo: 'PACA_AGUA' }, cantMin: 1, cantMax: 50, precio: 5500 },
      { producto: { codigo: 'PACA_AGUA' }, cantMin: 51, cantMax: 100, precio: 5000 },
      { producto: { codigo: 'PACA_HIELO' }, cantMin: 1, cantMax: 30, precio: 8000 },
    ] as any)

    const result = await resolverPreciosPedido(
      [
        { codigo: 'PACA_AGUA' as const, cantidad: 10 },
        { codigo: 'PACA_HIELO' as const, cantidad: 5 },
      ],
      'PUNTO',
    )
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ codigo: 'PACA_AGUA', precio: 5500, origen: 'volumen' })
    expect(result[1]).toMatchObject({ codigo: 'PACA_HIELO', precio: 8000, origen: 'volumen' })
    expect(prisma.precioVolumen.findMany).toHaveBeenCalledTimes(1)
  })

  it('picks best tier for cantidad between multiple tiers', async () => {
    vi.mocked(prisma.precioVolumen.findMany).mockResolvedValue([
      { producto: { codigo: 'PACA_AGUA' }, cantMin: 1, cantMax: 50, precio: 5500 },
      { producto: { codigo: 'PACA_AGUA' }, cantMin: 51, cantMax: 100, precio: 5000 },
    ] as any)

    const result = await resolverPreciosPedido(
      [{ codigo: 'PACA_AGUA' as const, cantidad: 60 }],
      'PUNTO',
    )
    expect(result[0].precio).toBe(5000)
  })

  it('matches tier with null cantMax for large quantities', async () => {
    vi.mocked(prisma.precioVolumen.findMany).mockResolvedValue([
      { producto: { codigo: 'PACA_AGUA' }, cantMin: 1, cantMax: 50, precio: 5500 },
      { producto: { codigo: 'PACA_AGUA' }, cantMin: 51, cantMax: null, precio: 4500 },
    ] as any)

    const result = await resolverPreciosPedido(
      [{ codigo: 'PACA_AGUA' as const, cantidad: 200 }],
      'PUNTO',
    )
    expect(result[0].precio).toBe(4500)
  })

  it('falls back to base when no tier matches cantidad', async () => {
    vi.mocked(prisma.precioVolumen.findMany).mockResolvedValue([
      { producto: { codigo: 'PACA_AGUA' }, cantMin: 10, cantMax: 50, precio: 5500 },
    ] as any)

    const result = await resolverPreciosPedido(
      [{ codigo: 'PACA_AGUA' as const, cantidad: 1 }],
      'PUNTO',
    )
    expect(result).toEqual([{
      codigo: 'PACA_AGUA',
      precio: 0,
      cantidad: 1,
      subtotal: 0,
      origen: 'base',
    }])
  })

  it('mixes resolution sources across items', async () => {
    vi.mocked(prisma.precioVolumen.findMany).mockResolvedValue([
      { producto: { codigo: 'PACA_AGUA' }, cantMin: 1, cantMax: 50, precio: 5500 },
      { producto: { codigo: 'PACA_HIELO' }, cantMin: 1, cantMax: 30, precio: 8000 },
    ] as any)

    const result = await resolverPreciosPedido(
      [
        { codigo: 'PACA_AGUA' as const, cantidad: 10, precioManual: 6000 },
        { codigo: 'PACA_HIELO' as const, cantidad: 5 },
        { codigo: 'BOTELLON_FAB' as const, cantidad: 2 },
      ],
      'PUNTO',
    )
    expect(result).toHaveLength(3)
        
    const ag = result.find(r => r.codigo === 'PACA_AGUA')!
    expect(ag).toMatchObject({ precio: 6000, origen: 'manual' })

    const hi = result.find(r => r.codigo === 'PACA_HIELO')!
    expect(hi).toMatchObject({ precio: 8000, origen: 'volumen' })

    const bf = result.find(r => r.codigo === 'BOTELLON_FAB')!
    expect(bf).toMatchObject({ precio: 0, origen: 'base' })
  })

  it('handles cliente not found gracefully', async () => {
    vi.mocked(prisma.cliente.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.precioVolumen.findMany).mockResolvedValue([
      { producto: { codigo: 'PACA_AGUA' }, cantMin: 1, cantMax: 50, precio: 5500 },
    ] as any)

    const result = await resolverPreciosPedido(
      [{ codigo: 'PACA_AGUA' as const, cantidad: 10 }],
      'PUNTO',
      'nonexistent',
    )
    expect(result).toEqual([{
      codigo: 'PACA_AGUA',
      precio: 5500,
      cantidad: 10,
      subtotal: 55000,
      origen: 'volumen',
    }])
  })

  it('no DB calls when all items have cantidad <= 0', async () => {
    const result = await resolverPreciosPedido(
      [
        { codigo: 'PACA_AGUA' as const, cantidad: 0 },
        { codigo: 'PACA_HIELO' as const, cantidad: -1 },
      ],
      'PUNTO',
    )
    expect(result).toEqual([])
    expect(prisma.precioVolumen.findMany).not.toHaveBeenCalled()
  })

  it('uses custom db client instead of default prisma', async () => {
    const mockDb = {
      precioVolumen: {
        findMany: vi.fn().mockResolvedValue([
          { producto: { codigo: 'PACA_AGUA' }, cantMin: 1, cantMax: 50, precio: 3000 },
        ] as any),
      },
    } as any

    const result = await resolverPreciosPedido(
      [{ codigo: 'PACA_AGUA' as const, cantidad: 10 }],
      'DOMICILIO',
      undefined,
      mockDb,
    )
    expect(result).toEqual([{
      codigo: 'PACA_AGUA',
      precio: 3000,
      cantidad: 10,
      subtotal: 30000,
      origen: 'volumen',
    }])
    expect(mockDb.precioVolumen.findMany).toHaveBeenCalled()
    expect(prisma.precioVolumen.findMany).not.toHaveBeenCalled()
  })

  it('calculates subtotal correctly', async () => {
    vi.mocked(prisma.precioVolumen.findMany).mockResolvedValue([
      { producto: { codigo: 'BOTELLON_FAB' }, cantMin: 1, cantMax: 100, precio: 12000 },
    ] as any)

    const result = await resolverPreciosPedido(
      [{ codigo: 'BOTELLON_FAB' as const, cantidad: 3 }],
      'PUNTO',
    )
    expect(result[0].subtotal).toBe(36000)
  })
})

// ─── getPriceTable ───────────────────────────────────────────────────

describe('getPriceTable', () => {
  it('returns empty object when no prices exist', async () => {
    vi.mocked(prisma.precioVolumen.findMany).mockResolvedValue([])
    const table = await getPriceTable('PUNTO')
    expect(table).toEqual({})
  })

  it('groups tiers by product code', async () => {
    vi.mocked(prisma.precioVolumen.findMany).mockResolvedValue([
      { producto: { codigo: 'PACA_AGUA' }, cantMin: 1, cantMax: 50, precio: 5500 },
      { producto: { codigo: 'PACA_AGUA' }, cantMin: 51, cantMax: 100, precio: 5000 },
      { producto: { codigo: 'PACA_HIELO' }, cantMin: 1, cantMax: 30, precio: 8000 },
    ] as any)

    const table = await getPriceTable('PUNTO')
    expect(Object.keys(table)).toHaveLength(2)
    expect(table['PACA_AGUA']).toHaveLength(2)
    expect(table['PACA_HIELO']).toHaveLength(1)
  })

  it('passes canal to query', async () => {
    vi.mocked(prisma.precioVolumen.findMany).mockResolvedValue([])
    await getPriceTable('DOMICILIO')
    expect(prisma.precioVolumen.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { canal: 'DOMICILIO', activo: true },
      }),
    )
  })

  it('converts Decimal precio to Number', async () => {
    vi.mocked(prisma.precioVolumen.findMany).mockResolvedValue([
      { producto: { codigo: 'BOTELLON_DOM' }, cantMin: 1, cantMax: null, precio: 12000 },
    ] as any)

    const table = await getPriceTable('DOMICILIO')
    expect(typeof table['BOTELLON_DOM'][0].precio).toBe('number')
    expect(table['BOTELLON_DOM'][0].precio).toBe(12000)
  })
})
