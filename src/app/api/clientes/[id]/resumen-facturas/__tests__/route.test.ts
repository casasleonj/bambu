// @tests GET /api/clientes/[id]/resumen-facturas — sin límite de meses, historial completo o por rango
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const requireRole = vi.fn()
const clienteFindUnique = vi.fn()
const facturaFindMany = vi.fn()
const configFindMany = vi.fn()

vi.mock('@/lib/auth-check', () => ({ requireRole: (...a: unknown[]) => requireRole(...a) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    cliente: { findUnique: (...a: unknown[]) => clienteFindUnique(...a) },
    factura: { findMany: (...a: unknown[]) => facturaFindMany(...a) },
    config: { findMany: (...a: unknown[]) => configFindMany(...a) },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))

const get = async (query: string) => {
  const { GET } = await import('../route')
  return GET(new NextRequest(`http://localhost/api/clientes/c1/resumen-facturas${query}`), {
    params: Promise.resolve({ id: 'c1' }),
  })
}

describe('GET /api/clientes/[id]/resumen-facturas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireRole.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN' } })
    clienteFindUnique.mockResolvedValue({ id: 'c1', nombre: 'sandra', apellido: 'leon', telefono: '1', direccion: null, barrio: null })
    facturaFindMany.mockResolvedValue([])
    configFindMany.mockResolvedValue([])
  })

  it('solo ADMIN/CONTADOR (antes lo podía leer cualquier usuario autenticado)', async () => {
    requireRole.mockResolvedValue(NextResponse.json({ success: false }, { status: 403 }))
    const res = await get('')
    expect(res.status).toBe(403)
    expect(requireRole).toHaveBeenCalledWith(['ADMIN', 'CONTADOR'])
    expect(facturaFindMany).not.toHaveBeenCalled()
  })

  it('acepta un rango de más de 3 meses', async () => {
    const res = await get('?desde=2026-01-01&hasta=2026-10-24')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.periodo).toEqual({ desde: '2026-01-01', hasta: '2026-10-24' })
    expect(facturaFindMany.mock.calls[0][0].where.fecha).toBeDefined()
  })

  it('sin fechas devuelve el historial completo, sin filtro de fecha', async () => {
    const res = await get('')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.periodo).toEqual({ desde: null, hasta: null })
    expect(facturaFindMany.mock.calls[0][0].where).not.toHaveProperty('fecha')
    expect(facturaFindMany.mock.calls[0][0].where.estado).toEqual({ not: 'ANULADA' })
  })

  it('un solo extremo también filtra', async () => {
    await get('?desde=2026-06-01')
    expect(facturaFindMany.mock.calls[0][0].where.fecha).toHaveProperty('gte')
    expect(facturaFindMany.mock.calls[0][0].where.fecha).not.toHaveProperty('lte')
  })

  it('rechaza fechas mal formadas o invertidas', async () => {
    expect((await get('?desde=ayer')).status).toBe(400)
    expect((await get('?desde=2026-10-24&hasta=2026-01-01')).status).toBe(400)
  })
})
