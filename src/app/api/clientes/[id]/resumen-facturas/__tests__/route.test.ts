// @tests GET /api/clientes/[id]/resumen-facturas — sin límite de meses, historial completo o por rango
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const requireRole = vi.fn()
const clienteFindUnique = vi.fn()
const facturaFindMany = vi.fn()
const facturaGroupBy = vi.fn()
const configFindMany = vi.fn()

vi.mock('@/lib/auth-check', () => ({ requireRole: (...a: unknown[]) => requireRole(...a) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    cliente: { findUnique: (...a: unknown[]) => clienteFindUnique(...a) },
    factura: {
      findMany: (...a: unknown[]) => facturaFindMany(...a),
      groupBy: (...a: unknown[]) => facturaGroupBy(...a),
    },
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
    facturaGroupBy.mockResolvedValue([])
    configFindMany.mockResolvedValue([])
  })

  it('ADMIN, CONTADOR y ASISTENTE, igual que GET /api/facturas (#556, #758); el resto recibe 403', async () => {
    requireRole.mockResolvedValue(NextResponse.json({ success: false }, { status: 403 }))
    const res = await get('')
    expect(res.status).toBe(403)
    expect(requireRole).toHaveBeenCalledWith(['ADMIN', 'CONTADOR', 'ASISTENTE'])
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
    // Sin `estado` (enlace antiguo) = Todas, anuladas incluidas: sin filtro de estado.
    expect(facturaFindMany.mock.calls[0][0].where).not.toHaveProperty('estado')
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

  describe('filtro de estado (#758)', () => {
    it.each(['EMITIDA', 'PARCIAL', 'PAGADA', 'ANULADA'] as const)('estado=%s trae solo ese estado', async (estado) => {
      const res = await get(`?estado=${estado}`)
      expect(res.status).toBe(200)
      expect(facturaFindMany.mock.calls[0][0].where.estado).toBe(estado)
      expect((await res.json()).filtro.estado).toBe(estado)
    })

    it('estado=TODAS y sin estado incluyen las anuladas; incluirAnuladas=false las quita', async () => {
      await get('?estado=TODAS')
      expect(facturaFindMany.mock.calls[0][0].where).not.toHaveProperty('estado')
      await get('?estado=TODAS&incluirAnuladas=false')
      expect(facturaFindMany.mock.calls[1][0].where.estado).toEqual({ not: 'ANULADA' })
    })

    it('rechaza un estado inválido', async () => {
      expect((await get('?estado=BORRADOR')).status).toBe(400)
      expect(facturaFindMany).not.toHaveBeenCalled()
    })

    it('los conteos de las pestañas ignoran el estado elegido', async () => {
      facturaGroupBy.mockResolvedValue([{ estado: 'PAGADA', _count: { _all: 4 } }])
      await get('?estado=PARCIAL')
      expect(facturaGroupBy.mock.calls[0][0].where).not.toHaveProperty('estado')
      expect(facturaGroupBy.mock.calls[0][0].where.clienteId).toBe('c1')
    })

    it('los totales suman solo vigentes y reportan las anuladas aparte', async () => {
      const base = { fecha: new Date('2026-11-02T15:00:00Z'), pedido: null }
      facturaFindMany.mockResolvedValue([
        { ...base, id: 'a', numero: 'FAC-1', total: 120_000, montoPagado: 120_000, saldo: 0, estado: 'PAGADA' },
        { ...base, id: 'b', numero: 'FAC-2', total: 85_000, montoPagado: 40_000, saldo: 45_000, estado: 'PARCIAL' },
        { ...base, id: 'c', numero: 'FAC-3', total: 50_000, montoPagado: 20_000, saldo: 0, estado: 'ANULADA' },
      ])
      const body = await (await get('')).json()
      expect(body.totales).toEqual({ total: 205_000, totalPagado: 160_000, saldo: 45_000, count: 2 })
      expect(body.anuladas).toEqual({ count: 1, totalHistorico: 50_000 })
      expect(body.facturas.map((x: { estado: string }) => x.estado)).toEqual(['PAGADA', 'PARCIAL', 'ANULADA'])
    })
  })
})
