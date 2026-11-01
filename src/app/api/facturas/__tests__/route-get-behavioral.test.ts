// @tests GET /api/facturas — filtros, orden y totales calculados en el servidor
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const requireRole = vi.fn()
const findMany = vi.fn()
const groupBy = vi.fn()
const aggregate = vi.fn()

vi.mock('@/lib/auth-check', () => ({
  requireAuth: vi.fn(),
  requireRole: (...a: unknown[]) => requireRole(...a),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    factura: {
      findMany: (...a: unknown[]) => findMany(...a),
      groupBy: (...a: unknown[]) => groupBy(...a),
      aggregate: (...a: unknown[]) => aggregate(...a),
    },
  },
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
vi.mock('@/lib/sequence', () => ({ getNextNumero: vi.fn() }))
vi.mock('@/lib/locks', () => ({ withAdvisoryLock: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))
vi.mock('@/lib/factura-empresa', () => ({ getFacturaEmpresaSnapshot: vi.fn() }))

const grupos = [
  { estado: 'PAGADA', _count: { _all: 2 }, _sum: { total: 100, saldo: 0, montoPagado: 100 } },
  { estado: 'EMITIDA', _count: { _all: 1 }, _sum: { total: 50, saldo: 50, montoPagado: 0 } },
  { estado: 'ANULADA', _count: { _all: 3 }, _sum: { total: 900, saldo: 0, montoPagado: 900 } },
]

const get = async (query: string) => {
  const { GET } = await import('../route')
  return GET(new NextRequest(`http://localhost/api/facturas?${query}`))
}

describe('GET /api/facturas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireRole.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN' } })
    findMany.mockResolvedValue([])
    groupBy.mockResolvedValue(grupos)
    aggregate.mockResolvedValue({ _min: { fecha: new Date('2026-05-16T00:00:00Z') } })
  })

  it('la lectura es de ADMIN, CONTADOR y ASISTENTE; quien no tiene el rol recibe 403', async () => {
    requireRole.mockResolvedValue(NextResponse.json({ success: false }, { status: 403 }))
    const res = await get('')
    expect(res.status).toBe(403)
    expect(requireRole).toHaveBeenCalledWith(['ADMIN', 'CONTADOR', 'ASISTENTE'])
    expect(findMany).not.toHaveBeenCalled()
  })

  it('los totales salen del servidor y no cuentan anuladas por defecto', async () => {
    const body = await (await get('clienteId=c1')).json()
    expect(body.totales).toMatchObject({
      totalFacturado: 150,
      totalCobrado: 100,
      totalPorCobrar: 50,
      count: 3,
      pagadas: 2,
      pendientes: 1,
    })
    expect(body.totales.pendienteDesde).toBeTruthy()
    expect(body.conteosPorEstado).toMatchObject({ TODAS: 3, ANULADA: 3, PAGADA: 2, EMITIDA: 1, PARCIAL: 0 })
  })

  it('el cliente seleccionado llega al where de lista, totales y deuda', async () => {
    await get('clienteId=c1&desde=2026-01-01')
    expect(findMany.mock.calls[0][0].where).toMatchObject({ clienteId: 'c1', estado: { not: 'ANULADA' } })
    expect(groupBy.mock.calls[0][0].where).toMatchObject({ clienteId: 'c1' })
    expect(aggregate.mock.calls[0][0].where).toMatchObject({ clienteId: 'c1', saldo: { gt: 0 } })
  })

  it('con incluirAnuladas=true los totales suman las anuladas', async () => {
    const body = await (await get('incluirAnuladas=true')).json()
    expect(body.totales.totalFacturado).toBe(1050)
    expect(body.totales.count).toBe(6)
    expect(findMany.mock.calls[0][0].where).not.toHaveProperty('estado')
  })

  it('ordena en el servidor con la lista blanca de campos', async () => {
    await get('sort=saldo&dir=asc')
    expect(findMany.mock.calls[0][0].orderBy[0]).toEqual({ saldo: 'asc' })
    await get('sort=cualquiercosa&dir=asc')
    expect(findMany.mock.calls[1][0].orderBy[0]).toEqual({ fecha: 'asc' })
  })

  it('el tamaño de la lista paginada respeta la pestaña de estado', async () => {
    const body = await (await get('estado=PAGADA&page=1&pageSize=50')).json()
    expect(body.total).toBe(2)
    expect(findMany.mock.calls[0][0].where).toMatchObject({ estado: 'PAGADA' })
  })
})
