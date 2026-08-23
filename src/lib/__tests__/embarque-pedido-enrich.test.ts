import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    negocio: { findMany: vi.fn() },
    cliente: { findMany: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { enrichPedidosWithNegocio, type PedidoParaEnriquecer } from '@/lib/embarque-pedido-enrich'
import type { Negocio, Cliente } from '@prisma/client'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('enrichPedidosWithNegocio', () => {
  it('preserves input order 1:1', async () => {
    vi.mocked(prisma.negocio.findMany).mockResolvedValue([])
    vi.mocked(prisma.cliente.findMany).mockResolvedValue([
      { id: 'c1', nombre: 'Ana', apellido: null },
      { id: 'c2', nombre: 'Beto', apellido: null },
      { id: 'c3', nombre: 'Caro', apellido: null },
    ] as unknown as Cliente[])

    const pedidos: PedidoParaEnriquecer[] = [
      { id: 'p1', numero: 1, clienteId: 'c3' },
      { id: 'p2', numero: 2, clienteId: 'c1' },
      { id: 'p3', numero: 3, clienteId: 'c2' },
    ]

    const result = await enrichPedidosWithNegocio(pedidos)
    expect(result.map((p) => p.id)).toEqual(['p1', 'p2', 'p3'])
    expect(result.map((p) => p.nombreCli)).toEqual(['Caro', 'Ana', 'Beto'])
  })

  it('resolves negocio name when negocioId present, falls back to cliente barrio-less display otherwise', async () => {
    vi.mocked(prisma.negocio.findMany).mockResolvedValue([
      { id: 'n1', nombre: 'Tienda Uno' },
    ] as unknown as Negocio[])
    vi.mocked(prisma.cliente.findMany).mockResolvedValue([
      { id: 'c1', nombre: 'Ana', apellido: 'Gómez' },
    ] as unknown as Cliente[])

    const pedidos: PedidoParaEnriquecer[] = [
      { id: 'p1', numero: 1, clienteId: 'c1', negocioId: 'n1' },
    ]

    const result = await enrichPedidosWithNegocio(pedidos)
    expect(result[0].nombreNegocioCli).toBe('Tienda Uno')
    expect(result[0].nombreCli).toBe('Ana')
  })

  it('dedupes negocioIds/clienteIds into a single batch query regardless of how many pedidos share them', async () => {
    vi.mocked(prisma.negocio.findMany).mockResolvedValue([{ id: 'n1', nombre: 'Tienda' }] as unknown as Negocio[])
    vi.mocked(prisma.cliente.findMany).mockResolvedValue([{ id: 'c1', nombre: 'Ana', apellido: null }] as unknown as Cliente[])

    const pedidos: PedidoParaEnriquecer[] = Array.from({ length: 10 }, (_, i) => ({
      id: `p${i}`,
      numero: i,
      clienteId: 'c1',
      negocioId: 'n1',
    }))

    await enrichPedidosWithNegocio(pedidos)
    expect(prisma.negocio.findMany).toHaveBeenCalledTimes(1)
    expect(prisma.cliente.findMany).toHaveBeenCalledTimes(1)
  })

  // Regression guard for the /api/embarques N+1 fix: calling
  // enrichPedidosWithNegocio ONCE on the flattened pedidos of multiple
  // embarques and re-splitting by each embarque's original pedido count
  // must produce the exact same per-embarque results as calling it once
  // PER embarque (the old, un-batched behavior).
  it('flatten-across-embarques + reslice by boundary produces the same result as per-embarque calls', async () => {
    vi.mocked(prisma.negocio.findMany).mockResolvedValue([{ id: 'n1', nombre: 'Tienda' }] as unknown as Negocio[])
    vi.mocked(prisma.cliente.findMany).mockResolvedValue([
      { id: 'c1', nombre: 'Ana', apellido: null },
      { id: 'c2', nombre: 'Beto', apellido: null },
    ] as unknown as Cliente[])

    const embarqueA: PedidoParaEnriquecer[] = [
      { id: 'p1', numero: 1, clienteId: 'c1', negocioId: 'n1' },
      { id: 'p2', numero: 2, clienteId: 'c2' },
    ]
    const embarqueB: PedidoParaEnriquecer[] = []
    const embarqueC: PedidoParaEnriquecer[] = [
      { id: 'p3', numero: 3, clienteId: 'c2', negocioId: 'n1' },
    ]
    const embarques = [embarqueA, embarqueB, embarqueC]

    // Old behavior: one enrich call per embarque.
    const expectedPerEmbarque = await Promise.all(embarques.map((peds) => enrichPedidosWithNegocio(peds)))

    // New behavior: flatten once, enrich once, reslice by boundary.
    const allPedidos = embarques.flatMap((e) => e)
    const allEnriquecidos = await enrichPedidosWithNegocio(allPedidos)
    let cursor = 0
    const actualPerEmbarque = embarques.map((e) => {
      const slice = allEnriquecidos.slice(cursor, cursor + e.length)
      cursor += e.length
      return slice
    })

    expect(actualPerEmbarque).toEqual(expectedPerEmbarque)
  })
})
