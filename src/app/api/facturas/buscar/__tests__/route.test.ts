// @tests GET /api/facturas/buscar — búsqueda de clientes y facturas sobre toda la base
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const requireRole = vi.fn()
const clienteFindMany = vi.fn()
const facturaFindMany = vi.fn()

vi.mock('@/lib/auth-check', () => ({ requireRole: (...a: unknown[]) => requireRole(...a) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    cliente: { findMany: (...a: unknown[]) => clienteFindMany(...a) },
    factura: { findMany: (...a: unknown[]) => facturaFindMany(...a) },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

const get = async (q: string) => {
  const { GET } = await import('../route')
  return GET(new NextRequest(`http://localhost/api/facturas/buscar?q=${encodeURIComponent(q)}`))
}

describe('GET /api/facturas/buscar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireRole.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN' } })
    clienteFindMany.mockResolvedValue([])
    facturaFindMany.mockResolvedValue([])
  })

  it('solo ADMIN/CONTADOR', async () => {
    requireRole.mockResolvedValue(NextResponse.json({ success: false }, { status: 403 }))
    const res = await get('sandra')
    expect(res.status).toBe(403)
    expect(requireRole).toHaveBeenCalledWith(['ADMIN', 'CONTADOR'])
  })

  it('con menos de 2 caracteres no consulta la base', async () => {
    const body = await (await get('s')).json()
    expect(body).toMatchObject({ clientes: [], facturas: [] })
    expect(clienteFindMany).not.toHaveBeenCalled()
  })

  it('busca clientes con facturas, palabra por palabra, en toda la base', async () => {
    clienteFindMany.mockResolvedValue([
      { id: 'c1', nombre: 'sandra', apellido: 'leon', telefono: '573163887163', direccion: null },
    ])
    const body = await (await get('sandra leon')).json()
    expect(body.clientes).toHaveLength(1)
    const where = clienteFindMany.mock.calls[0][0].where
    expect(where.AND).toHaveLength(3) // dos palabras + "tiene facturas"
    expect(where.AND[2]).toEqual({ facturas: { some: {} } })
    expect(clienteFindMany.mock.calls[0][0].take).toBeLessThanOrEqual(8)
  })

  it('devuelve las facturas con el nombre completo del cliente', async () => {
    facturaFindMany.mockResolvedValue([
      { id: 'f1', numero: 'FAC-00001', fecha: new Date('2026-10-24T12:00:00Z'), cliente: { nombre: 'sandra', apellido: 'leon' } },
    ])
    const body = await (await get('FAC-0')).json()
    expect(body.facturas[0]).toMatchObject({ id: 'f1', numero: 'FAC-00001', clienteNombre: 'sandra leon' })
  })
})
