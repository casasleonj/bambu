// @tests backfill-negocio-coords — Bloque 6 (coords de negocio)
// Espejo de backfill-cliente-coords pero con la estrategia de Negocio:
//   linkUbicacion (incluye short URLs) → mediana GPS de pedidos ENTREGADOS
//   con negocioId → null. Sin fuente NEGOCIO (el propio negocio es la fuente).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock prisma ANTES de importar el módulo bajo test.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    negocio: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    pedido: {
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { backfillNegocioCoords, persistNegocioCoords } from '../backfill-negocio-coords'

const mockNegocio = prisma.negocio as unknown as {
  findUnique: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
}
const mockPedido = prisma.pedido as unknown as {
  findMany: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.clearAllMocks()
  // Por defecto el fetch de expansión falla (sin red) → fallback determinístico.
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('backfillNegocioCoords', () => {
  it('1) prioriza linkUbicacion parseado (PARSED_URL)', async () => {
    mockNegocio.findUnique.mockResolvedValue({
      id: 'n1',
      linkUbicacion: 'https://maps.google.com/?q=4.65,-74.05',
    })
    const r = await backfillNegocioCoords('n1')
    expect(r).toEqual({ lat: 4.65, lng: -74.05, origen: 'PARSED_URL' })
  })

  it('1b) short URL se expande server-side → PARSED_URL', async () => {
    mockNegocio.findUnique.mockResolvedValue({
      id: 'n1',
      linkUbicacion: 'https://maps.app.goo.gl/short',
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: 'https://maps.google.com/?q=4.7,-74.1' } }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await backfillNegocioCoords('n1')
    expect(r).toEqual({ lat: 4.7, lng: -74.1, origen: 'PARSED_URL' })
  })

  it('2) cae a mediana GPS si linkUbicacion no parsea (solo ENTREGADOS con negocioId)', async () => {
    mockNegocio.findUnique.mockResolvedValue({
      id: 'n1',
      linkUbicacion: 'https://goo.gl/maps/X',
    })
    mockPedido.findMany.mockResolvedValue([
      { gpsLat: 4.64, gpsLng: -74.04 },
      { gpsLat: 4.65, gpsLng: -74.05 },
      { gpsLat: 4.66, gpsLng: -74.06 },
      { gpsLat: 4.67, gpsLng: -74.07 },
    ])
    const r = await backfillNegocioCoords('n1')
    expect(r).toEqual({ lat: 4.655, lng: -74.055, origen: 'GPS_HISTORIAL' })
    // El where filtra por negocioId + ENTREGADO + GPS presente
    const where = mockPedido.findMany.mock.calls[0][0].where
    expect(where.negocioId).toBe('n1')
    expect(where.estadoEntrega).toBe('ENTREGADO')
    expect(where.gpsLat).toEqual({ not: null })
    expect(where.gpsLng).toEqual({ not: null })
  })

  it('2b) mediana con N impar → elemento del medio', async () => {
    mockNegocio.findUnique.mockResolvedValue({ id: 'n1', linkUbicacion: null })
    mockPedido.findMany.mockResolvedValue([
      { gpsLat: 4.0, gpsLng: -74.0 },
      { gpsLat: 4.5, gpsLng: -74.5 },
      { gpsLat: 5.0, gpsLng: -75.0 },
    ])
    const r = await backfillNegocioCoords('n1')
    expect(r!.lat).toBe(4.5)
    expect(r!.lng).toBe(-74.5)
  })

  it('2c) requiere ≥2 puntos GPS (1 solo no es suficiente)', async () => {
    mockNegocio.findUnique.mockResolvedValue({ id: 'n1', linkUbicacion: null })
    mockPedido.findMany.mockResolvedValue([{ gpsLat: 4.65, gpsLng: -74.05 }])
    const r = await backfillNegocioCoords('n1')
    expect(r).toBeNull()
  })

  it('3) retorna null si no hay link ni GPS historial', async () => {
    mockNegocio.findUnique.mockResolvedValue({ id: 'n1', linkUbicacion: null })
    mockPedido.findMany.mockResolvedValue([])
    const r = await backfillNegocioCoords('n1')
    expect(r).toBeNull()
  })

  it('4) retorna null si el negocio no existe', async () => {
    mockNegocio.findUnique.mockResolvedValue(null)
    const r = await backfillNegocioCoords('nonexistent')
    expect(r).toBeNull()
  })
})

describe('persistNegocioCoords', () => {
  it('persiste lat/lng cuando hay result', async () => {
    mockNegocio.update.mockResolvedValue({})
    await persistNegocioCoords('n1', { lat: 4.65, lng: -74.05, origen: 'PARSED_URL' })
    expect(mockNegocio.update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: { lat: 4.65, lng: -74.05 },
    })
  })

  it('limpia coords si result es null', async () => {
    mockNegocio.update.mockResolvedValue({})
    await persistNegocioCoords('n1', null)
    expect(mockNegocio.update).toHaveBeenCalledWith({
      where: { id: 'n1' },
      data: { lat: null, lng: null },
    })
  })
})
