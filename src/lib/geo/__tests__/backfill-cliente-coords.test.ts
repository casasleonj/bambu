// @tests backfill-cliente-coords — Bloque 1
// Mockeamos prisma y cubrimos las 4 estrategias del backfill.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma ANTES de importar el módulo bajo test.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    cliente: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    pedido: {
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { backfillClienteCoords, persistClienteCoords } from '../backfill-cliente-coords'

const mockCliente = prisma.cliente as unknown as {
  findUnique: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
}
const mockPedido = prisma.pedido as unknown as {
  findMany: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('backfillClienteCoords', () => {
  it('1) prioriza linkUbicacion parseado (PARSED_URL)', async () => {
    mockCliente.findUnique.mockResolvedValue({
      id: 'c1',
      linkUbicacion: 'https://maps.google.com/?q=4.65,-74.05',
      negocioDefault: { lat: 10, lng: 10 }, // debería ser ignorado
    })
    const r = await backfillClienteCoords('c1')
    expect(r).toEqual({ lat: 4.65, lng: -74.05, origen: 'PARSED_URL' })
  })

  it('2) cae a mediana GPS si linkUbicacion no parsea', async () => {
    mockCliente.findUnique.mockResolvedValue({
      id: 'c1',
      linkUbicacion: 'https://goo.gl/maps/X', // short URL → no parsea
      negocioDefault: { lat: 10, lng: 10 },
    })
    // 4 puntos: la mediana es (4.65, -74.05)
    mockPedido.findMany.mockResolvedValue([
      { gpsLat: 4.64, gpsLng: -74.04 },
      { gpsLat: 4.65, gpsLng: -74.05 },
      { gpsLat: 4.66, gpsLng: -74.06 },
      { gpsLat: 4.67, gpsLng: -74.07 },
    ])
    const r = await backfillClienteCoords('c1')
    expect(r).toEqual({ lat: 4.655, lng: -74.055, origen: 'GPS_HISTORIAL' })
  })

  it('2b) mediana con N impar → elemento del medio', async () => {
    mockCliente.findUnique.mockResolvedValue({
      id: 'c1',
      linkUbicacion: null,
      negocioDefault: null,
    })
    mockPedido.findMany.mockResolvedValue([
      { gpsLat: 4.0, gpsLng: -74.0 },
      { gpsLat: 4.5, gpsLng: -74.5 },
      { gpsLat: 5.0, gpsLng: -75.0 },
    ])
    const r = await backfillClienteCoords('c1')
    expect(r!.lat).toBe(4.5)
    expect(r!.lng).toBe(-74.5)
  })

  it('2c) GPS con outliers → mediana robusta (no se rompe)', async () => {
    mockCliente.findUnique.mockResolvedValue({
      id: 'c1',
      linkUbicacion: null,
      negocioDefault: null,
    })
    // 5 puntos: 4 alrededor de 4.65,-74.05 + 1 outlier a 100km
    mockPedido.findMany.mockResolvedValue([
      { gpsLat: 4.64, gpsLng: -74.04 },
      { gpsLat: 4.65, gpsLng: -74.05 },
      { gpsLat: 4.66, gpsLng: -74.06 },
      { gpsLat: 4.67, gpsLng: -74.07 },
      { gpsLat: 4.68, gpsLng: -74.08 }, // mediana
      { gpsLat: 5.5, gpsLng: -75.5 },   // outlier (no afecta mediana)
    ])
    const r = await backfillClienteCoords('c1')
    expect(r!.lat).toBeCloseTo(4.665, 3)
    expect(r!.lng).toBeCloseTo(-74.065, 3)
  })

  it('3) cae a Negocio default si no hay link ni GPS', async () => {
    mockCliente.findUnique.mockResolvedValue({
      id: 'c1',
      linkUbicacion: null,
      negocioDefault: { lat: 4.6, lng: -74.0 },
    })
    mockPedido.findMany.mockResolvedValue([]) // sin GPS
    const r = await backfillClienteCoords('c1')
    expect(r).toEqual({ lat: 4.6, lng: -74.0, origen: 'NEGOCIO' })
  })

  it('4) retorna null si no hay nada', async () => {
    mockCliente.findUnique.mockResolvedValue({
      id: 'c1',
      linkUbicacion: null,
      negocioDefault: null,
    })
    mockPedido.findMany.mockResolvedValue([])
    const r = await backfillClienteCoords('c1')
    expect(r).toBeNull()
  })

  it('5) requiere ≥2 puntos GPS (1 solo no es suficiente)', async () => {
    mockCliente.findUnique.mockResolvedValue({
      id: 'c1',
      linkUbicacion: null,
      negocioDefault: { lat: 4.6, lng: -74.0 },
    })
    mockPedido.findMany.mockResolvedValue([
      { gpsLat: 4.65, gpsLng: -74.05 },
    ])
    // Solo 1 GPS → cae a Negocio
    const r = await backfillClienteCoords('c1')
    expect(r!.origen).toBe('NEGOCIO')
  })

  it('6) retorna null si el cliente no existe', async () => {
    mockCliente.findUnique.mockResolvedValue(null)
    const r = await backfillClienteCoords('nonexistent')
    expect(r).toBeNull()
  })
})

describe('persistClienteCoords', () => {
  it('persiste con geocodeAt cuando hay result', async () => {
    mockCliente.update.mockResolvedValue({})
    const before = Date.now()
    await persistClienteCoords('c1', { lat: 4.65, lng: -74.05, origen: 'PARSED_URL' })
    expect(mockCliente.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: {
        lat: 4.65,
        lng: -74.05,
        geocodeOrigen: 'PARSED_URL',
        geocodeAt: expect.any(Date),
      },
    })
    const arg = mockCliente.update.mock.calls[0][0].data
    expect(arg.geocodeAt.getTime()).toBeGreaterThanOrEqual(before)
  })

  it('limpia coords si result es null', async () => {
    mockCliente.update.mockResolvedValue({})
    await persistClienteCoords('c1', null)
    expect(mockCliente.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: {
        lat: null,
        lng: null,
        geocodeOrigen: null,
        geocodeAt: null,
      },
    })
  })
})
