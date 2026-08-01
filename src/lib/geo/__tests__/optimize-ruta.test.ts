// @tests optimize-ruta — Bloque 6 (coords efectivas en TSP)
// Verifica que optimizeEmbarqueOrden usa la regla única pickCoords
// (negocio gana, fallback cliente) y reporta sinCoords correctamente.
// El TSP se mockea para aislar la selección/orden de coords.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    pedido: {
      findMany: vi.fn(),
    },
  },
}))

vi.mock('../tsp', () => ({
  optimizeRuta: vi.fn((puntos: { id: string; lat: number; lng: number }[]) => ({
    orden: [...puntos].reverse(),
    distanciaKm: 12.5,
    iteraciones: 3,
  })),
}))

import { prisma } from '@/lib/prisma'
import { optimizeEmbarqueOrden } from '../optimize-ruta'
import { optimizeRuta } from '../tsp'

const mockPedido = prisma.pedido as unknown as {
  findMany: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('optimizeEmbarqueOrden', () => {
  it('usa las coords del NEGOCIO cuando existen (regla pickCoords)', async () => {
    mockPedido.findMany.mockResolvedValue([
      {
        id: 'p1',
        cliente: { lat: 1, lng: 1 },
        negocio: { lat: 4.65, lng: -74.05 },
      },
    ])
    const r = await optimizeEmbarqueOrden('e1')
    expect(r.pedidoIds).toEqual(['p1'])
    expect(optimizeRuta).toHaveBeenCalledWith([{ id: 'p1', lat: 4.65, lng: -74.05 }])
  })

  it('cae a cliente si el negocio no tiene coords', async () => {
    mockPedido.findMany.mockResolvedValue([
      {
        id: 'p1',
        cliente: { lat: 4.6, lng: -74.0 },
        negocio: { lat: null, lng: null },
      },
    ])
    await optimizeEmbarqueOrden('e1')
    expect(optimizeRuta).toHaveBeenCalledWith([{ id: 'p1', lat: 4.6, lng: -74.0 }])
  })

  it('mezcla: sin-coords quedan fuera del orden y se reportan', async () => {
    mockPedido.findMany.mockResolvedValue([
      { id: 'p1', cliente: { lat: 4.6, lng: -74.0 }, negocio: null },
      { id: 'p2', cliente: { lat: null, lng: null }, negocio: null },
      { id: 'p3', cliente: { lat: 4.7, lng: -74.1 }, negocio: { lat: null, lng: null } },
    ])
    const r = await optimizeEmbarqueOrden('e1')
    // TSP recibe solo p1 y p3; el mock invierte el orden
    expect(r.pedidoIds).toEqual(['p3', 'p1'])
    expect(r.sinCoords).toEqual(['p2'])
    expect(optimizeRuta).toHaveBeenCalledWith([
      { id: 'p1', lat: 4.6, lng: -74.0 },
      { id: 'p3', lat: 4.7, lng: -74.1 },
    ])
  })

  it('filtra solo PENDIENTE/EN_RUTA del embarque', async () => {
    mockPedido.findMany.mockResolvedValue([])
    await optimizeEmbarqueOrden('e1')
    const where = mockPedido.findMany.mock.calls[0][0].where
    expect(where.embarqueId).toBe('e1')
    expect(where.estado).toEqual({ in: ['PENDIENTE', 'EN_RUTA'] })
  })

  it('sin pedidos con coords → resultado vacío y NO llama al TSP', async () => {
    mockPedido.findMany.mockResolvedValue([
      { id: 'p1', cliente: { lat: null, lng: null }, negocio: null },
    ])
    const r = await optimizeEmbarqueOrden('e1')
    expect(r).toEqual({ pedidoIds: [], distanciaKm: 0, iteraciones: 0, sinCoords: ['p1'] })
    expect(optimizeRuta).not.toHaveBeenCalled()
  })
})
